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

# Exactly what the guide tells hospital IT to do.
cp .env.example .env
sed -i "s|^BIOTRAKR_HOST=.*|BIOTRAKR_HOST=localhost   # comment, as people write them|" .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env

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

# The recovery command never quietly promotes someone.
api "$URL/api/admin/users" "${auth[@]}" -d '{"email":"nurse@ci.example","firstName":"Nia","lastName":"Nurse","role":"clinical_staff"}' > /dev/null
if docker compose exec -T api node dist/apps/api/src/cli/create-admin.js --email nurse@ci.example --reset > /dev/null 2>&1; then
  fail "create-admin --reset promoted a nurse without --make-admin"
fi

# A password that cannot go in a connection address is caught with a clear message.
msg=$(docker compose run --rm --no-deps -e DATABASE_URL='postgresql://biotrakr:ab/cd@db:5432/biotrakr' api node -e 1 2>&1 || true)
echo "$msg" | grep -q "openssl rand -hex 32" || fail "bad DATABASE_URL not explained: $msg"

# The API works with no internet at all (hospital servers often have none).
db_ctr=$(docker compose ps -q db)
docker network create --internal biotrakr-offline > /dev/null
docker network connect --alias db biotrakr-offline "$db_ctr"
dburl=$(docker compose exec -T api printenv DATABASE_URL | tr -d '\r')
docker run -d --name api-offline --network biotrakr-offline -e NODE_ENV=production \
  -e DATABASE_URL="$dburl" -e JWT_SECRET="$(openssl rand -hex 32)" -e CLIENT_URL=https://localhost \
  -e ALLOWED_ORIGINS=https://localhost -e CHECKPOINT_DISABLE=1 biotrakr-api:local > /dev/null
for i in $(seq 1 60); do
  if docker exec api-offline node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
  sleep 3
done
[ "${ok:-}" = 1 ] || { docker logs api-offline | tail -20; fail "API did not start without internet"; }
docker rm -f api-offline > /dev/null; docker network disconnect biotrakr-offline "$db_ctr"; docker network rm biotrakr-offline > /dev/null

# Back up, then check the status report sees it.
docker compose exec -T backup sh /scripts/backup.sh
report=$(sh scripts/status.sh)
echo "$report"
echo "$report" | grep -q '"status":"ok"' || fail "status.sh: API not reported ready"
echo "$report" | grep -q 'hours old)$' || fail "status.sh: latest backup not reported"
file=$(docker compose exec -T backup sh -c 'ls -1t /backups/biotrakr_*.dump | head -1' | tr -d '\r')

# Restore refuses while the app is running.
if docker compose exec -T backup sh /scripts/restore.sh "$file" > /dev/null 2>&1; then
  fail "restore ran while the app was connected"
fi
docker compose stop api web

# A broken backup leaves the current data untouched.
docker compose exec -T backup sh -c "head -c 20000 '$file' > /backups/broken.dump"
if docker compose exec -T backup sh /scripts/restore.sh /backups/broken.dump; then fail "restore of a broken file succeeded"; fi
n=$(docker compose exec -T db psql -U biotrakr -d biotrakr -Atc "select count(*) from assets where \"assetTagNumber\"='VENT-CI-1'" | tr -d '\r')
[ "$n" = 1 ] || fail "failed restore damaged the live database"

# Damage the data, restore the good backup, and check it came back.
docker compose exec -T db psql -U biotrakr -d biotrakr -c "delete from asset_status_changes; update assets set \"assetStatus\"='ACTIVE'" > /dev/null
docker compose exec -T backup sh /scripts/restore.sh "$file"
docker compose start api web
docker compose up -d --wait --wait-timeout 300
token=$(api "$URL/api/auth/login" -d '{"email":"admin@ci.example","password":"ward rounds at seven"}' | jq -r .accessToken)
status=$(api "$URL/api/assets/lookup?code=VENT-CI-1" -H "authorization: Bearer $token" | jq -r .assetStatus)
[ "$status" = QUARANTINED ] || fail "restore did not bring the data back: $status"
hyper=$(docker compose exec -T db psql -U biotrakr -d biotrakr -Atc "select count(*) from timescaledb_information.hypertables" | tr -d '\r')
[ "$hyper" -ge 7 ] || fail "hypertables after restore: $hyper"

echo "Deployment smoke test passed"
