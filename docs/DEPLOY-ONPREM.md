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
- **A way to reach people at night**: an email account BioTrakr can send from, and ideally an SMS provider account. See step 7.
- **Somewhere for a second copy of the backups**: a NAS share or a USB disk. See step 6.

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

Uploaded files (calibration certificates, safety test reports, service reports, contracts) are kept in the database, so every backup includes them and a restore brings back records and files together. Each file is at most 10 MB; plan the backup disk for the files you expect to upload (for example, 2,000 certificates of about 1 MB each add about 2 GB to each backup, times the days kept).

The edit history (who changed what) is in the database too, and each entry carries a hash of the one before it. A restore takes the history back to the night of the backup along with everything else; write the restore into the equipment logbook, because entries made after that backup are gone. The *Edit history* register prints the latest entry's hash: keep a printed copy now and then (for example with each month's registers), and a later check that no longer reaches that hash shows entries were removed.

**A backup on the same server is not enough.** One failed disk, or ransomware on the server, takes the data and its backups together. Give BioTrakr a second place for them: a shared folder on a NAS or file server (Windows/SMB or NFS), or a USB disk. After each backup it copies the file there (with `caddy-pki.tgz`), checks the copy, and removes copies older than `BACKUP_KEEP_DAYS`.

**1. Mount it on the server** at `/mnt/biotrakr-copy`, through `/etc/fstab` so that it comes back after a reboot. Ask hospital IT for a share (or a folder) used only for this. `nofail` lets the server start even when the NAS is down. Pick one:

A Windows (SMB) share:

```bash
sudo apt-get install -y cifs-utils
sudo mkdir -p /mnt/biotrakr-copy
sudo nano /root/.smb-biotrakr       # the share's account, three lines:
                                    #   username=biotrakr-backup
                                    #   password=...
                                    #   domain=CITYGENERAL
sudo chmod 600 /root/.smb-biotrakr
```

and this line in `/etc/fstab` (`sudo nano /etc/fstab`):

```
//nas.citygeneral.local/biotrakr  /mnt/biotrakr-copy  cifs  credentials=/root/.smb-biotrakr,uid=0,gid=0,file_mode=0600,dir_mode=0700,_netdev,nofail  0  0
```

An NFS export:

```bash
sudo apt-get install -y nfs-common
sudo mkdir -p /mnt/biotrakr-copy
```

```
nas.citygeneral.local:/volume1/biotrakr  /mnt/biotrakr-copy  nfs  soft,timeo=150,retrans=3,_netdev,nofail  0  0
```

(`soft`: if the NAS stops answering, the copy fails and is reported instead of waiting for ever.) The copies are written by the server's root user. Many NAS turn root into an anonymous user on NFS ("root squash"): give that user write access to the folder, or ask IT to allow root from this server.

A USB disk (formatted ext4):

```bash
sudo blkid                          # find the disk's UUID
sudo mkdir -p /mnt/biotrakr-copy
```

```
UUID=<the disk's UUID>  /mnt/biotrakr-copy  ext4  defaults,nofail  0  2
```

Then mount it and check:

```bash
sudo mount -a
findmnt /mnt/biotrakr-copy          # must show the share or disk; if it shows nothing, stop and fix that first
```

**2. Mark it**, once, while it is mounted:

```bash
sudo touch /mnt/biotrakr-copy/.biotrakr-backup-target
```

If the share ever fails to mount, `/mnt/biotrakr-copy` is just an empty folder on the server's own disk. Without this file there, BioTrakr refuses to copy into it and reports "copy location is not mounted", rather than quietly putting the "second" copy on the same disk. So never create the file while the share is not mounted. If you rotate USB disks, create it on each one.

**3. Turn it on.** In `.env`, set `BACKUP_COPY_DIR=/mnt/biotrakr-copy`. Then:

```bash
docker compose up -d
docker compose exec backup sh /scripts/backup.sh
sh scripts/status.sh                # Second copy: /mnt/biotrakr-copy, last copied ... (0 hours ago)
```

The server can delete or encrypt what is on the share too (that is how it removes old copies). Turn on snapshots on the NAS (most have them), kept longer than `BACKUP_KEEP_DAYS`, so that ransomware on the server cannot reach the older versions. With USB disks, keep one unplugged and swap them weekly (`sudo umount /mnt/biotrakr-copy` before unplugging).

After a reboot, if `status.sh` says the copy location is NOT MOUNTED while `findmnt /mnt/biotrakr-copy` shows it is, the share came up after BioTrakr started. Run `docker compose restart backup`.

**Being told when backups go wrong.** BioTrakr warns administrators when a backup or the second copy fails, or when backups are overdue: in the app, and by email or SMS as well if those are set up (see [Urgent notices](#7-urgent-notices)). `sh scripts/status.sh` shows the same things: the latest backup, the error if the last one failed, free disk space, and the second copy. For a monitor outside BioTrakr, also set `BACKUP_PING_URL` to one that alerts when it stops being called (for example Uptime Kuma inside the hospital, or healthchecks.io). It is called only when both the backup and its second copy succeed.

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

To restore from the second copy (for example after the server's own disk failed and BioTrakr was installed again with the same `BACKUP_COPY_DIR`), give the file under `/backup-copy/` instead, e.g. `/backup-copy/biotrakr_2026-10-09_020000.dump`.

The restore is loaded into a separate database first and only swapped in if it succeeds, so a failed or damaged backup leaves the current data as it was. The data you replaced is kept as a database named `biotrakr_before_restore_<date>`; the script prints how to delete it once everything looks right. The script refuses to run while the app is connected, so stop `api` and `web` first.

Test a restore once a month on a spare machine, so you know it works before you need it.

## 7. Urgent notices

When a life-saving device (critical or high criticality, or life support) is reported out of use and nobody has it in hand, biomed at that facility hears at once. If nobody has started on it, the engineers and administrators, and whoever it is assigned to, hear again after 15 and 60 minutes, then every hour until work starts (`NOTIFY_ESCALATE_MINUTES` and `NOTIFY_ESCALATE_REPEAT_MINUTES` in `.env`). Administrators also hear about the server itself: a backup that failed or was missed, a disk filling up, a background job that stopped, messages that are not getting through.

Out of the box these notices appear only inside BioTrakr, so at night nobody sees them. Set up at least one way out of the app. Until you do, **Settings → System** shows a warning saying so.

**Email**, through the hospital's mail server or an email provider. Each person gets it at the address they sign in with:

```bash
SMTP_HOST=mail.citygeneral.local
SMTP_PORT=587                      # 465 needs SMTP_SECURE=true as well
SMTP_USER=biotrakr@citygeneral.local
SMTP_PASSWORD='the password'       # single quotes, in case it has $ or # in it
NOTIFY_EMAIL_FROM=BioTrakr <biotrakr@citygeneral.local>
```

Email is easy to miss at night. For the people on call, add SMS.

**SMS**, through any SMS provider with a web API (or the SMS gateway the hospital already uses for patients). For each message BioTrakr calls the address you give, with `{to}` replaced by the mobile number (`+919876543210`), `{to_digits}` by the same without the `+` (`919876543210`), and `{text}` by the message. Copy the format from your provider's API documentation. Two common shapes:

```bash
# A link with everything in it (GET):
NOTIFY_SMS_URL='https://sms-provider.example/api/send?apikey=YOUR_KEY&sender=BTRKMS&to={to_digits}&message={text}'

# JSON sent with a key in a header (POST):
NOTIFY_SMS_URL=https://sms-provider.example/v1/messages
NOTIFY_SMS_METHOD=POST
NOTIFY_SMS_HEADERS='{"authkey":"YOUR_KEY"}'
NOTIFY_SMS_BODY='{"to":"{to_digits}","message":"{text}","sender":"BTRKMS"}'
```

Keep these values in single quotes in `.env`. A body that starts with `{` is sent as JSON; anything else as a form.

- **Know when the provider refuses a message.** Many providers answer "200 OK" even when they reject one, with the reason in the reply. Set `NOTIFY_SMS_SUCCESS_MATCH` to text that their reply contains only when the message was accepted (for example `NOTIFY_SMS_SUCCESS_MATCH='"status":"success"'`). Any other reply then counts as failed and is retried.
- **In India, the wording must match a DLT template** registered with your sender ID. The message is `BioTrakr: {title} {link}`, for example `BioTrakr: Urgent: ICU ventilator (VENT-7) reported faulty https://biotrakr.citygeneral.local/maintenance`. The title is at most 120 characters. Register a template for it with your provider, or change the wording to fit a template you already have with `NOTIFY_SMS_TEXT` (it may use `{title}` and `{link}`). Some providers also want the template's id in the address.
- Enter each person's mobile number in **Settings → People**. People without one get email only.
- SMS providers are on the internet. If the server has no internet access, ask IT to allow it to reach the provider's address only, or use email through the hospital's own mail server.

**Your own gateway (webhook).** If the hospital runs its own gateway (WhatsApp, a pager system), set `NOTIFY_WEBHOOK_URL` and `NOTIFY_WEBHOOK_SECRET` (at least 16 characters, e.g. `openssl rand -hex 32`). Each urgent notice is posted to it as signed JSON with the names and numbers of the people to reach. The README (Notifications) explains the format and how to check the signature.

Then `docker compose up -d`, sign in as an administrator, open **Settings → System** and press **Send me a test alert**. It sends one message to your own email and mobile through each way that is set up, and shows what happened. The same page lists messages that did not get through, and settings that cannot work (an SMS address without `{to}`, a webhook secret that is too short) are reported there and to administrators instead of being ignored.

**Knowing if the server itself stops.** Nothing on a server can report its own power cut or crash. Set `HEARTBEAT_URL` to a monitor on another machine. BioTrakr calls it every five minutes while the app and its database work, and the monitor alerts you (by its own email, SMS or app) when the calls stop. A "Push" monitor in Uptime Kuma, on any other machine in the hospital, works without internet access; healthchecks.io works if the server can reach the internet.

## 8. Updating

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

## 9. Day to day

| To… | Run (in `/opt/biotrakr/deploy`) |
|---|---|
| See if everything is up | `sh scripts/status.sh` |
| See recent errors | `docker compose logs --tail=100 api` |
| Restart the app | `docker compose restart api web` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |

The containers restart on their own after a crash or a server reboot. Logs are rotated automatically (50 MB per service).

**Settings → System** (administrators) shows what needs attention: backups and their second copy, free disk space, the background jobs, and urgent messages that did not get through. Administrators are also told when any of these goes wrong (step 7).

**Preventive maintenance**: the API opens PM work orders 14 days before they fall due. To change that, set `PM_LEAD_DAYS` in `.env`, then run `docker compose up -d`. Set `TZ` to the hospital's time zone so the due dates written in work orders are local.

**Repair limits and uptime target**: breakdowns are held to 72 hours for critical and life-saving equipment and 7 days for the rest (the BMMP Model RFP), and uptime is measured against 95%. A CHC or PHC, or a contract with other terms, can change `DOWNTIME_LIMIT_CRITICAL_HOURS`, `DOWNTIME_LIMIT_OTHER_HOURS` and `UPTIME_TARGET_PERCENT` in `.env`.

## 10. Security checklist

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
