# Installing BioTrakr on a hospital server

This guide is for the person setting up BioTrakr on a server inside the hospital network. It takes about an hour, most of it waiting for the first build.

Everything runs in Docker on one machine:

| Container | What it does |
|---|---|
| `proxy` | HTTPS for the whole app (Caddy). The only part reachable from the network (ports 80 and 443). |
| `web` | The pages staff use. |
| `api` | The application server. Applies database updates when it starts. |
| `db` | PostgreSQL with TimescaleDB. Not reachable from the network. |
| `backup` | Backs up the database every night. |

## 1. What you need

- **A server**: Ubuntu Server 22.04 or 24.04 LTS. For one hospital: 4 CPU cores, 8 GB RAM, 100 GB SSD. A virtual machine is fine.
- **A fixed IP address** and **a name for it** on the hospital network, for example `biotrakr.citygeneral.local`. Ask hospital IT to add the DNS entry. Staff will type this name, and it is printed inside every QR label, so choose it once and keep it.
- **Network access** from wards to the server on ports 80 and 443 (the hospital Wi-Fi that phones and ward computers use).
- **Internet access during installation** (to download Docker images and packages). The running system does not need the internet. See [Servers without internet access](#servers-without-internet-access) if yours has none.
- **An HTTPS certificate** for the name above. See step 3; it matters.

## 2. Install Docker and get BioTrakr

Install Docker Engine with the Compose plugin by following Docker's official guide for Ubuntu: <https://docs.docker.com/engine/install/ubuntu/>. Then:

```bash
sudo usermod -aG docker $USER      # log out and back in afterwards
sudo apt-get install -y git
sudo git clone https://github.com/Blacktre33/BioTrakr.git /opt/biotrakr
sudo chown -R $USER /opt/biotrakr
cd /opt/biotrakr/deploy
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

```bash
BIOTRAKR_HOST=biotrakr.citygeneral.local   # the name from step 1, without https://
DB_PASSWORD=...                            # openssl rand -hex 32
JWT_SECRET=...                             # openssl rand -hex 32 (a different one)
```

Use `-hex` as shown: the database password goes inside a connection address, where characters such as `/` or `@` would stop the API from starting. Keep `.env` private: it holds the database password and the key that signs everyone's sign-ins.

## 3. HTTPS certificate (needed for QR scanning)

Phones only let a web page use the camera on a secure (HTTPS) connection that they trust. Without a trusted certificate, the app opens with a warning and **"Scan with camera" does not work**. Pick one option.

**Option A: a certificate from hospital IT (recommended).** Many hospitals have an internal certificate authority that every hospital device already trusts. Ask IT for a certificate and key for your server name. Put them in `deploy/certs/` as `biotrakr.crt` (including any intermediate certificates) and `biotrakr.key`, and set:

```bash
CADDY_TLS=/certs/biotrakr.crt /certs/biotrakr.key
```

**Option B: BioTrakr's own certificate authority.** Leave `CADDY_TLS=internal`. Caddy creates its own authority. After step 4, copy its root certificate off the server:

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./biotrakr-root.crt
```

Then install `biotrakr-root.crt` as a trusted certificate on every device that uses BioTrakr:

- **Android**: Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
- **iPhone/iPad**: open the file to install the profile, then Settings → General → About → Certificate Trust Settings → turn it on.
- **Windows**: double-click → Install Certificate → Local Machine → "Trusted Root Certification Authorities". For many PCs, IT can push it with Group Policy.

Option B works, but every new phone needs the step above. Option A avoids that.

With option B, the authority's private key lives in Docker's `caddy-data` volume. The nightly backup also saves it (`caddy-pki.tgz` in the backups folder). Never run `docker compose down -v`: `-v` deletes the volumes, so the database **and** the authority would be recreated, and every device would need the new root certificate (browsers will refuse the site until then).

## 4. Start it

```bash
cd /opt/biotrakr/deploy
docker compose up -d --build
```

The first build takes 10–20 minutes. If it stops with a message that a service is "unhealthy", wait a minute and run `docker compose up -d` again: on first start the API sets up the database before it reports healthy. Then check:

```bash
sh scripts/status.sh
```

All five services should say `healthy` or `Up`, and "API readiness" should say `{"status":"ok"}`. Open `https://biotrakr.citygeneral.local` on a ward computer: you should see the sign-in page with no certificate warning.

## 5. First administrator

```bash
docker compose exec api node dist/apps/api/src/cli/create-admin.js \
  --organization "City General Hospital" \
  --email it.admin@citygeneral.example --first Asha --last Rao
```

It prints a one-time password. Sign in with it; you will be asked to choose your own. Then, in **Settings**:

1. **Facilities & rooms**: add the hospital, its departments (ICU, OT, Emergency…), and the buildings, floors and rooms.
2. **People**: add biomedical engineers, technicians and ward staff. Each gets a one-time password to give them in person.
3. **Devices**: add them one by one (**Assets → Add device**) or import the spreadsheet (**Assets → Import**; download the template first).
4. **Print labels** (**Assets → Print labels**) on A4 label sheets (Avery L7160 layout) or a 50 × 25 mm label printer. Print them while signed in at the real address (not `localhost` or an IP address): the QR codes contain the address you are using.

Locked out? Run the same command with `--email … --reset` for a new one-time password.

## 6. Backups

The `backup` container makes a compressed backup every night at 02:00 into `deploy/backups/` and keeps 14 days. The hour is in the `TZ` time zone in `.env` (Asia/Kolkata unless you change it); `BACKUP_HOUR` and `BACKUP_KEEP_DAYS` are there too. Each backup is checked to be complete and readable; only a test restore (below) proves the data itself. The files are readable by root only: they contain staff details and password hashes.

**A backup on the same server is not enough.** If the disk fails, both are lost. Copy the folder to another machine every night, for example to a hospital NAS with a cron job on the server (as root, since the files are root-only):

```bash
# sudo crontab -e
30 3 * * * rsync -a /opt/biotrakr/deploy/backups/ backupuser@nas.citygeneral.local:/backups/biotrakr/
```

Do not add `--delete`: it would also copy deletions (or a ransomware attack) to the NAS. Let the NAS keep its own retention.

Back up by hand at any time (before updates, for example):

```bash
docker compose exec backup sh /scripts/backup.sh
```

**Restore** (replaces the current data with the backup; anything entered since the backup is lost):

```bash
docker compose stop api web
docker compose exec backup sh /scripts/restore.sh /backups/biotrakr_2026-10-09_020000.dump
docker compose start api web
```

The restore is loaded into a separate database first and only swapped in if it succeeds, so a failed or damaged backup leaves the current data as it was. The data you replaced is kept as a database named `biotrakr_before_restore_<date>`; the script prints how to delete it once everything looks right. The script refuses to run while the app is connected, so stop `api` and `web` first.

Test a restore once a month on a spare machine, so you know it works before you need it.

To be warned if backups stop, set `BACKUP_PING_URL` to a monitor that alerts when it stops being called (for example Uptime Kuma inside the hospital, or healthchecks.io).

## 7. Updating

```bash
cd /opt/biotrakr/deploy
docker compose exec backup sh /scripts/backup.sh     # a backup first, always
git -C /opt/biotrakr pull
docker compose up -d --build
sh scripts/status.sh
```

Database changes are applied automatically when the new API starts. A large update can take a few minutes; if `up` reports "unhealthy", wait and run `docker compose up -d` again.

**Going back to the previous version** (only if an update goes wrong; everything entered since the pre-update backup is lost):

```bash
docker compose stop api web
docker compose exec backup sh /scripts/restore.sh /backups/<the backup made before the update>.dump
git -C /opt/biotrakr log --oneline -5                 # find the previous version
git -C /opt/biotrakr checkout <previous version>
docker compose up -d --build
```

Restore first, then the old version: the old version must not start on a database the new one has already changed. When the problem is fixed, return to normal updates with `git -C /opt/biotrakr checkout main` before `git pull`.

## 8. Day to day

| To… | Run (in `/opt/biotrakr/deploy`) |
|---|---|
| See if everything is up | `sh scripts/status.sh` |
| See recent errors | `docker compose logs --tail=100 api` |
| Restart the app | `docker compose restart api web` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |

The containers restart on their own after a crash or a server reboot. Logs are rotated automatically (50 MB per service).

**Optional SMS/WhatsApp alerts**: urgent problem reports can be sent to a gateway the hospital runs. Set `NOTIFY_WEBHOOK_URL` and `NOTIFY_WEBHOOK_SECRET` in `.env`, then `docker compose up -d`. The README (Notifications) explains the message format and how the gateway checks it is genuine.

**Preventive maintenance**: the API opens PM work orders 14 days before they fall due. To change that, set `PM_LEAD_DAYS` in `.env`, then run `docker compose up -d`. Set `TZ` to the hospital's time zone so the due dates written in work orders are local.

## 9. Security checklist

- Firewall: only 80 and 443 (from the hospital network) and SSH (from IT's machines) need to be reachable. Note that ports published by Docker bypass `ufw` rules, so limit them with the hospital's network firewall, with `BIND_IP` in `.env` (answer only on one server address), or with rules in Docker's `DOCKER-USER` chain. The database is not published at all.
- Keep `.env` readable only by the administrator (`chmod 600 .env`).
- Install Ubuntu security updates (`sudo apt-get upgrade`) and BioTrakr updates regularly.
- Remove accounts of people who leave (**Settings → People → Deactivate**). Deactivated people are signed out everywhere.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| "Scan with camera" does nothing on phones | The phone does not trust the certificate (step 3), or the page was opened over http:// or an IP address. |
| Phones cannot open the site at all | Either the name does not resolve on the ward Wi-Fi (check with `nslookup biotrakr.citygeneral.local` on a ward computer) or the firewall blocks 443. Opening the IP address will not work in either case: the server only answers to its name. |
| `api` keeps restarting | `docker compose logs api`. Usually `.env`: `JWT_SECRET` shorter than 32 characters, a `DB_PASSWORD` with characters such as `/` (use `openssl rand -hex 32`), or `DB_PASSWORD` changed after the first start (the database keeps the first one). |
| QR labels open the wrong address | They were printed at `localhost` or an IP address. Reprint them while signed in at the real name. |
| Disk filling up | `docker system df`; old images can be removed with `docker image prune`. Check `deploy/backups/`. |

## Servers without internet access

Build the images on a machine with internet access (and Docker), then copy them over. Build for the server's processor type (`linux/amd64` for a normal server, even from an Apple-silicon Mac):

```bash
# On the connected machine:
git clone https://github.com/Blacktre33/BioTrakr.git biotrakr && cd biotrakr
docker build --platform linux/amd64 -f apps/api/Dockerfile -t biotrakr-api:local .
docker build --platform linux/amd64 -f apps/web/Dockerfile -t biotrakr-web:local .
docker pull --platform linux/amd64 timescale/timescaledb:2.17.2-pg15
docker pull --platform linux/amd64 caddy:2.8.4
docker save biotrakr-api:local biotrakr-web:local timescale/timescaledb:2.17.2-pg15 caddy:2.8.4 \
  | gzip > ~/biotrakr-images.tar.gz          # outside the repository folder

# Copy biotrakr-images.tar.gz and the repository to the server, then there:
gunzip -c biotrakr-images.tar.gz | docker load
cd /opt/biotrakr/deploy && docker compose up -d --no-build
```
