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
DB_PASSWORD=...                            # openssl rand -base64 32
JWT_SECRET=...                             # openssl rand -base64 32 (a different one)
```

Keep `.env` private: it holds the database password and the key that signs everyone's sign-ins.

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

## 4. Start it

```bash
cd /opt/biotrakr/deploy
docker compose up -d --build
```

The first build takes 10–20 minutes. Then check:

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

The `backup` container makes a compressed, verified backup every night at 02:00 (server time) into `deploy/backups/` and keeps 14 days (`BACKUP_HOUR`, `BACKUP_KEEP_DAYS` in `.env`).

**A backup on the same server is not enough.** If the disk fails, both are lost. Copy the folder to another machine every night, for example to a hospital NAS with a cron job on the server:

```bash
# crontab -e
30 3 * * * rsync -a --delete /opt/biotrakr/deploy/backups/ backupuser@nas.citygeneral.local:/backups/biotrakr/
```

Back up by hand at any time (before updates, for example):

```bash
docker compose exec backup sh /scripts/backup.sh
```

**Restore** (replaces the current data with the backup):

```bash
docker compose stop api web
docker compose exec backup sh /scripts/restore.sh /backups/biotrakr_2026-10-09_020000.dump
docker compose start api web
```

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

Database changes are applied automatically when the new API starts. To go back to the previous version: `git -C /opt/biotrakr checkout <previous version>`, `docker compose up -d --build`, and restore the backup you just made.

## 8. Day to day

| To… | Run (in `/opt/biotrakr/deploy`) |
|---|---|
| See if everything is up | `sh scripts/status.sh` |
| See recent errors | `docker compose logs --tail=100 api` |
| Restart the app | `docker compose restart api web` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |

The containers restart on their own after a crash or a server reboot. Logs are rotated automatically (50 MB per service).

**Optional SMS/WhatsApp alerts**: urgent problem reports can be sent to a gateway the hospital runs. Set `NOTIFY_WEBHOOK_URL` and `NOTIFY_WEBHOOK_SECRET` in `.env`, then `docker compose up -d`. The README (Notifications) explains the message format and how the gateway checks it is genuine.

## 9. Security checklist

- Firewall: allow only 80 and 443 from the hospital network, and SSH from IT's machines. Nothing else needs to be reachable.
- Keep `.env` readable only by the administrator (`chmod 600 .env`).
- Install Ubuntu security updates (`sudo apt-get upgrade`) and BioTrakr updates regularly.
- Remove accounts of people who leave (**Settings → People → Deactivate**). Deactivated people are signed out everywhere.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| "Scan with camera" does nothing on phones | The phone does not trust the certificate (step 3), or the page was opened over http:// or an IP address. |
| Phones cannot open the site at all | DNS: the name does not resolve on the ward Wi-Fi, or the firewall blocks 443. Try the IP address to tell the two apart. |
| `api` keeps restarting | `docker compose logs api`: usually a mistake in `.env` (`JWT_SECRET` shorter than 32 characters, or a changed `DB_PASSWORD` after the first start). |
| QR labels open the wrong address | They were printed at `localhost` or an IP address. Reprint them while signed in at the real name. |
| Disk filling up | `docker system df`; old images can be removed with `docker image prune`. Check `deploy/backups/`. |

## Servers without internet access

Build the images on a machine with internet access, then copy them over:

```bash
# On the connected machine, in a copy of the repository:
cd deploy && docker compose build
docker save biotrakr-api:local biotrakr-web:local timescale/timescaledb:2.17.2-pg15 caddy:2.8.4 | gzip > biotrakr-images.tar.gz

# On the server (with the repository copied to /opt/biotrakr):
gunzip -c biotrakr-images.tar.gz | docker load
cd /opt/biotrakr/deploy && docker compose up -d --no-build
```
