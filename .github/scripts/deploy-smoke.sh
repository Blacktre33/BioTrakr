#!/bin/bash
# Builds and starts the production stack (deploy/), then checks it end to
# end: first admin, sign-in over HTTPS, setup, a device, a problem report,
# the web pages, and a backup restored over the live database.
set -euo pipefail
cd "$(dirname "$0")/../../deploy"

fail() {
  echo "::error title=Deployment smoke test::$1"
  for svc in db api web proxy backup; do
    logs=$(docker compose logs --no-color --tail=40 "$svc" 2>&1 | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')
    echo "::error title=${svc} logs::${logs}"
  done
  exit 1
}
trap 'fail "step failed at line $LINENO"' ERR

cat > .env <<ENV
BIOTRAKR_HOST=localhost
CADDY_TLS=internal
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
BACKUP_DIR=./backups
ENV

docker compose up -d --build --wait --wait-timeout 900

URL=https://localhost
api() { curl -sSk --fail-with-body -H 'content-type: application/json' "$@"; }

ready=$(api "$URL/api/health/ready")
[ "$(echo "$ready" | jq -r .status)" = ok ] || fail "readiness: $ready"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$URL/login"); [ "$code" = 200 ] || fail "login page: $code"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$URL/scan"); [ "$code" = 200 ] || fail "scan page: $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/login"); [ "$code" = 308 ] || fail "http should redirect: $code"

out=$(docker compose exec -T api node dist/apps/api/src/cli/create-admin.js \
  --organization "CI General Hospital" --email admin@ci.example --first Ci --last Admin)
temp=$(echo "$out" | sed -n 's/^One-time password: //p')
[ -n "$temp" ] || fail "create-admin: $out"

token=$(api "$URL/api/auth/login" -d "{\"email\":\"admin@ci.example\",\"password\":\"$temp\"}" | jq -r .accessToken)
blocked=$(curl -sk -o /dev/null -w '%{http_code}' -H "authorization: Bearer $token" "$URL/api/admin/users")
[ "$blocked" = 403 ] || fail "one-time password should only allow a password change: $blocked"
token=$(api "$URL/api/auth/change-password" -H "authorization: Bearer $token" \
  -d "{\"currentPassword\":\"$temp\",\"newPassword\":\"ward rounds at seven\"}" | jq -r .accessToken)
auth=(-H "authorization: Bearer $token")

fac=$(api "$URL/api/admin/facilities" "${auth[@]}" -d '{"facilityCode":"CGH","facilityName":"CI General"}' | jq -r .id)
dept=$(api "$URL/api/admin/departments" "${auth[@]}" -d "{\"facilityId\":\"$fac\",\"departmentCode\":\"ICU\",\"departmentName\":\"Intensive Care\"}" | jq -r .id)
me=$(api "$URL/api/auth/me" "${auth[@]}" | jq -r .userId)
asset=$(api "$URL/api/assets" "${auth[@]}" -d "{\"assetTagNumber\":\"VENT-CI-1\",\"equipmentName\":\"ICU ventilator\",\"manufacturer\":\"Hamilton\",\"modelNumber\":\"C6\",\"serialNumber\":\"SN-1\",\"deviceCategory\":\"LIFE_SUPPORT\",\"criticalityLevel\":\"CRITICAL\",\"riskClassification\":\"CLASS_III\",\"purchaseDate\":\"2024-01-15T00:00:00Z\",\"purchaseCost\":1,\"usefulLifeYears\":10,\"currentFacilityId\":\"$fac\",\"custodianDepartmentId\":\"$dept\",\"primaryCustodianId\":\"$me\",\"pmFrequencyDays\":180}" | jq -r .id)
[ "$asset" != null ] || fail "could not register a device"
found=$(api "$URL/api/assets/lookup?code=https%3A%2F%2Flocalhost%2Fscan%3Fcode%3DVENT-CI-1" "${auth[@]}" | jq -r .assetTagNumber)
[ "$found" = VENT-CI-1 ] || fail "scan link lookup: $found"
api "$URL/api/work-orders/problem-reports" "${auth[@]}" -d "{\"assetId\":\"$asset\",\"description\":\"Alarm keeps sounding\",\"takeOutOfUse\":true}" > /dev/null
status=$(api "$URL/api/assets/lookup?code=VENT-CI-1" "${auth[@]}" | jq -r .assetStatus)
[ "$status" = QUARANTINED ] || fail "device should be out of use: $status"

hyper=$(docker compose exec -T db psql -U biotrakr -d biotrakr -Atc "select count(*) from timescaledb_information.hypertables")
[ "$hyper" -ge 7 ] || fail "TimescaleDB hypertables: $hyper"

# Back up, damage the data, restore, and check it came back.
docker compose exec -T backup sh /scripts/backup.sh
file=$(docker compose exec -T backup sh -c 'ls -1t /backups/biotrakr_*.dump | head -1' | tr -d '\r')
docker compose exec -T db psql -U biotrakr -d biotrakr -c "delete from asset_status_changes; update assets set \"assetStatus\"='ACTIVE'" > /dev/null
docker compose stop api web
docker compose exec -T backup sh /scripts/restore.sh "$file"
docker compose start api web
docker compose up -d --wait --wait-timeout 300
token=$(api "$URL/api/auth/login" -d '{"email":"admin@ci.example","password":"ward rounds at seven"}' | jq -r .accessToken)
status=$(api "$URL/api/assets/lookup?code=VENT-CI-1" -H "authorization: Bearer $token" | jq -r .assetStatus)
[ "$status" = QUARANTINED ] || fail "restore did not bring the data back: $status"

echo "Deployment smoke test passed"
