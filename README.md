# BioTrakr - Medical Equipment Management for Hospitals
> A device register, bedside "safe to use?" checks by QR scan, problem reports from the wards, biomed work orders and preventive maintenance, installed on the hospital's own server.

## 🏗️ Project Structure

```
biotrakr/
├── apps/
│   ├── api/              # NestJS backend API
│   ├── web/              # Next.js web application
│   └── ml-service/       # Python FastAPI ML service (experimental, see below)
├── packages/
│   ├── ui/               # Shared UI components
│   ├── types/            # Shared TypeScript types
│   ├── config/           # Shared configuration
│   └── utils/            # Shared utilities
├── deploy/               # Hospital server install (Docker Compose, HTTPS, backups)
├── infrastructure/
│   └── docker/           # Docker configurations for development
└── docs/                 # Documentation
```

### Shared Packages

- `@biotrakr/types` – canonical domain types shared by API and web clients.
- `@biotrakr/config` – zod-based environment loaders to avoid hard-coded URLs.
- `@biotrakr/utils` – security helpers for hashing, token creation, and guards.
- `@biotrakr/ui` – design tokens to be leveraged by every surface.

### What works today

- **Devices**: register, edit, search and filter devices; Excel import and export; QR label sheets.
- **On the ward**: scan a device to see whether it is safe to use; report a problem and take it out of use in one step.
- **Biomed**: a work queue (assign, start, waiting for parts, complete, release as safe), with every status change recorded.
- **Preventive maintenance**: work orders opened automatically ahead of each due date, and a month calendar.
- **PM checklists**: completing a PM means working through a checklist for that kind of device, item by item: pass, flag (needs attention, still usable), fail (not safe to use) or not applicable, with readings held to their limits (for example SpO2, NIBP and ECG against a simulator, defibrillator energy, pump flow accuracy) and the test equipment used. The checklist is picked from the device's name; built-in ones cover monitors, defibrillators, infusion and syringe pumps, ventilators, oxygen concentrators, suction, BP apparatus and general electrical equipment, and biomed engineers can copy one and change its items and limits to their manufacturers' specifications (Settings → PM checklists). A failed item takes the device out of use and opens a repair; the PM register, logbook and device page show what each PM found.
- **Calibration**: scheduled like PM; certificates recorded with the details NABH and NHSRC expect (NABL accreditation number, measurement uncertainty, or the reference equipment for in-house work). A failed calibration takes the device out of use until a passing one is recorded.
- **Electrical safety tests (IS/IEC 62353)**: scheduled like PM; the readings are checked against the standard's limits for the device's class and applied parts, and a failure takes the device out of use.
- **AMC/CMC contracts and warranties**: each contract with its vendor, period, yearly cost and the devices it covers; renewals keep what every year cost. Reminders go out 90, 60, 30 and 7 days before a contract ends and 90 and 30 days before a warranty ends (NHSRC advises renewing three months ahead). The dashboard shows the share of devices under warranty or contract.
- **Certificates and reports**: PDF, JPEG or PNG files (up to 10 MB) attached to calibrations, safety tests, contracts, work orders (signed service reports) and devices (manuals, installation reports, invoices). Files are kept in the database, so the nightly backup includes them; a wrong file is withdrawn with a reason and stays on record.
- **Registers for NABH and NHSRC**: the inventory master record (Annexure F), annual inventory survey (Annexure D) and each device's maintenance logbook (Annexure E) in the NHSRC column formats, plus calibration, electrical safety, PM, breakdown, AMC/CMC, uptime, condemnation and training registers. Printed on A4 with a sign-off block, or downloaded for Excel; viewer accounts let auditors open them.
- **History card and maintenance plan**: each device's history card puts its particulars (make, model, serial, supplier, purchase, warranty, contract, book value, maintenance intervals) above everything on record, oldest first: purchase, installation, contracts, PM, calibration and safety tests, breakdowns with their downtime, changes of status made by hand, and condemnation. The annual maintenance plan (NABH FMS.5.c) shows every device's PM, calibration and electrical safety tests month by month for the coming year: what is due, what is overdue and what was done.
- **Training**: each training session on medical equipment (operators, biomed, refreshers, induction) with the trainer, the equipment and devices it covered, and who attended as on the attendance sheet (ward staff need no account), with how each was assessed. The signed attendance sheet is attached to the session. The Training page lists every session, each device page shows its own, the history card includes them, and the training register prints them for NABH (FMS.5.e). Attendees' names stay out of the edit history, which records how many attended.
- **Condemnation**: biomed proposes a device for condemnation from its page, with the reasons, a justification and the repair estimate; its age, straight-line book value, and breakdowns and downtime over the last year go on file with the proposal. An administrator who did not propose it records the committee's decision (the meeting and minute); only an approval condemns the device, which takes it out of use for good and cancels its open work orders. The disposal is recorded with the method (authorised e-waste recycler, buyback, auction, transfer), the date and the certificate, and an X-ray or other radiation unit cannot be recorded as disposed of without AERB's decommissioning approval, nor an ultrasound machine sold or transferred without a PC-PNDT NOC. Committee minutes and certificates are attached to the proposal, and the condemnation register prints the file. A condemned or disposed status can no longer be set by hand.
- **Records that cannot be changed**: calibration and safety test records are never edited or deleted (the database refuses); a mistake is corrected by a new record that replaces it, with a reason, and the original stays on file.
- **Downtime and uptime**: every breakdown runs a clock from the report to the device being put right, against the BMMP limits: 72 hours for critical and life-saving equipment, 7 days for everything else. The work queue shows it, biomed is warned at three quarters of the limit and again (urgently, outside the app too for life-saving equipment) once it has passed, and the hours are kept with the completed work order. The uptime register lists each device's hours in service and out of use, breakdowns and time over the limit for any period, with mean time to attend, to repair and between failures.
- **Edit history (audit trail)**: every change to devices, work orders, checks, contracts, vendors, files, places and accounts is recorded with who, when, what changed (before and after) and why, in the same transaction as the change. Entries cannot be edited or deleted, and each is hash-chained (SHA-256) to the one before, so an entry altered or removed directly in the database is detected; the chain is checked daily and administrators are told if it breaks. Shown on each device page and printable as a register with the chain's latest hash. Personal details (names, phone, email) are recorded as changed, without their values.
- **Dashboard**: devices out of use, PM, calibration and electrical safety compliance, open work orders, time to repair.
- **Notifications**: in-app and browser notices; urgent reports by email and SMS (any HTTP SMS provider) and a signed webhook for the hospital's own gateway; escalation until work starts.
- **System health**: administrators are told (in the app, and by email and SMS) when a backup fails or is missed, a backup is not reaching its second location off the server, a disk fills up, a background job stops working, or messages are not getting through. Settings → System shows all of it, with a button to send yourself a test alert. An outside monitor can be told every five minutes that the server is alive (`HEARTBEAT_URL`).
- **Settings**: people (roles, one-time passwords, mobile numbers) and locations.

### Not built yet

- **Tracking** (live device locations), **Utilization** (usage figures) and a **Compliance** report show a "not available yet" notice and are not in the sidebar.
- **Device feeds**: the API accepts telemetry, RTLS, maintenance and error events ([docs/data-pipeline.md](./docs/data-pipeline.md)), but no screen shows them yet.
- **`apps/ml-service`** is experimental: its failure model is trained on generated data and nothing in the app calls it.

## 🏥 Installing at a hospital

To run BioTrakr on a hospital server (Docker, HTTPS, nightly backups, first administrator), follow [docs/DEPLOY-ONPREM.md](./docs/DEPLOY-ONPREM.md). The rest of this README is for developers.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker >= 24.0.0
- Python >= 3.11 (for ML service)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment defaults
cp .env.example apps/api/.env

# Start PostgreSQL/TimescaleDB (the file also starts optional development tools)
docker-compose up -d

# Apply database migrations and load demo data
cd apps/api
pnpm db:migrate
pnpm prisma:seed

# Start all services in development mode (via Turborepo)
pnpm dev
```

Sign in at http://localhost:3000/login with a seeded account, e.g.
`admin@demo.hospital.com` / `Admin123!` (development only).

### Authentication and roles

Every API route except `GET /api/health`, `POST /api/auth/login` and
`POST /api/auth/refresh` requires `Authorization: Bearer <access token>`.
Data is always scoped to the caller's organization.

| Role | Can |
|---|---|
| `admin` | Everything, including People and Locations settings, deleting devices and ingestion |
| `engineer` | Add and edit devices, Excel import, plus everything a technician can do |
| `technician` | Work orders, PM and device status (biomed); scan devices |
| `clinical_staff` | Scan devices, record sightings and report problems |
| `viewer` | Read only |
| `integration` | Ingestion endpoints only (device and gateway feeds) |

`JWT_SECRET` must be at least 32 characters; the API refuses to start without it.

> If your Docker volume was created from the old migrations, reset it once:
> `docker-compose down -v && docker-compose up -d`. See
> [`apps/api/prisma/README.md`](./apps/api/prisma/README.md) for the migration
> workflow and drift check.

### Scanning devices on the ward

`/scan` is a phone-first page: scan a tag (camera, or a keyboard-style
barcode scanner) or type its number, and it shows straight away whether the
device is safe to use (quarantined, with biomed, recalled, PM overdue), where
it is, and when it was last seen. Ward staff can log a sighting in one tap.

For the fastest path, print each label's QR code as a link:
`https://<web host>/scan?code=<asset tag>`. Pointing a phone's own camera at
the label then opens the device directly (after sign-in). Plain tag numbers,
asset ids and `biotrakr://asset/<id>` payloads also work.

### Bulk import from Excel

Assets → Import. Choosing a file checks every row first (`POST
/api/v1/assets/validate`, which never writes) and lists problems by row and
column, with a preview. Import (`POST /api/v1/assets/import`) saves all rows
in one transaction or none. Category, status, criticality and risk class
must match the template's Allowed Values sheet; facilities and departments
must already exist. Limits: 5 MB, 2,000 rows per file.

### Operating the API

- `GET /api/health`: liveness (the process is up).
- `GET /api/health/ready`: readiness. Returns 200 only when the database answers, otherwise 503. Point load-balancer health checks here.
- Every response carries an `x-request-id` header. If a load balancer sends a well-formed id, it is kept. A 500 response never shows internals; it gives this id to quote, and the same id is in the error log.
- On SIGTERM, the API finishes in-flight requests and closes database connections.
- JSON bodies can be up to 2 MB, enough for ingestion batches of 500 events.

### Notifications

Biomed sees notices in the app's bell: problem reports on their facility's devices, device faults that took a device out of use, work assigned to them. Reporters hear when their report is fixed or closed.

A report is **urgent** when a life-saving device (critical or high criticality, or the life-support category) is out of use, whether the reporter took it out of use or it already was, and biomed does not already have it in hand (no earlier urgent report still open, no work started on it). Urgent reports go to the top of the queue and outside the app. Until someone starts the work (moves it to in progress), they are escalated to the facility's engineers and administrators, and to whoever it is assigned to, after each step in `NOTIFY_ESCALATE_MINUTES` (15 and 60 minutes), then every `NOTIFY_ESCALATE_REPEAT_MINUTES` (an hour) for a day. Assigning the work does not stop the escalation; starting it does.

Outside the app, urgent notices go by **email** and **SMS** to each person who should hear (SMS to those with a mobile number in Settings → People, stored as `+` and digits, e.g. `+919876543210`), and to your own gateway as a signed **webhook**, whichever are set up. What ward staff typed is never sent outside (it may name a patient): messages carry the title, the place and a link. Set-up for hospitals, with SMS examples and Indian DLT templates, is in [docs/DEPLOY-ONPREM.md](./docs/DEPLOY-ONPREM.md#7-urgent-notices).

| Variable | Meaning |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` for 465), `SMTP_USER`, `SMTP_PASSWORD` | Mail server for email notices. |
| `NOTIFY_EMAIL_FROM` | Sender address, e.g. `BioTrakr <biotrakr@hospital.example>`. Email is on when this and `SMTP_HOST` are set. |
| `NOTIFY_SMS_URL` | SMS provider address; `{to}` (`+9198…`), `{to_digits}` (`9198…`) and `{text}` are filled in, URL-encoded. |
| `NOTIFY_SMS_METHOD`, `NOTIFY_SMS_BODY`, `NOTIFY_SMS_HEADERS` | `POST` with a body template (JSON if it starts with `{`, else a form) and extra headers as a JSON object. |
| `NOTIFY_SMS_TEXT` | Message wording, default `BioTrakr: {title} {link}` (match your DLT template). |
| `NOTIFY_SMS_SUCCESS_MATCH` | Text the provider's reply must contain for the SMS to count as sent; otherwise it is retried. |
| `NOTIFY_WEBHOOK_URL` | Where to POST urgent notices for your own gateway. |
| `NOTIFY_WEBHOOK_SECRET` | At least 16 characters. Required with the URL; nothing is sent unsigned. |
| `APP_URL` | Public address of the web app, used for links in messages. |
| `NOTIFY_ESCALATE_MINUTES` | Escalation steps, default `15,60`. |
| `NOTIFY_ESCALATE_REPEAT_MINUTES` | After the last step, again every N minutes until work starts (default 60, at least 5; `0` = never). |
| `NOTIFY_JOBS` | `off` stops escalation and delivery in this instance (they run every 30 s). |

Settings that were filled in but cannot work (a webhook secret under 16 characters, an SMS address without `{to}` or `{text}`, `SMTP_HOST` without `NOTIFY_EMAIL_FROM`) switch that channel off and are reported to administrators and on Settings → System, not ignored silently. **Send me a test alert** on that page sends one message to the administrator through each channel and shows the outcome.

Each POST carries `X-BioTrakr-Timestamp` and `X-BioTrakr-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>` with the secret. Check it, reject timestamps older than a few minutes, and de-duplicate on the body's `id` (it is signed; retries reuse it). The body has the title, severity, device, a link and the recipients' names, roles, phones and emails so the gateway can reach them; what ward staff typed is not included (it may name a patient). Keep the gateway inside the hospital network.

Delivery: a timeout, network error, 408, 429 or 5xx is retried with backoff (8 attempts over about an hour); any other 3xx/4xx is final (redirects are not followed). For email, a 5xx answer from the mail server (address refused) is final and anything else is retried. Messages that keep failing are reported to administrators, and listed on Settings → System. Sent and failed messages are deleted after 7 days, in-app notices after 90.

Escalation and delivery run inside the API process every 30 s, so the API must run as a long-lived service (not serverless). The system checks (below) notice if they stop working. Faults reported by devices take the device out of use and notify biomed once; they are not escalated, because no work order exists for them yet.

### System health

Every five minutes the API checks the installation itself and tells administrators (in the app; critical problems also by email, SMS and webhook) when a problem starts, reminds them daily while it lasts (weekly for warnings), and tells them when it is fixed:

- **Backups**, from the status the backup container writes (`BACKUP_STATUS_FILE`, set by `deploy/docker-compose.yml`): the last backup failed, none for 26 hours, the second copy off the server failed or is overdue, or there is no second copy at all (a warning).
- **Disk space** on the server (database) and on both backup locations: a warning under 15% or 5 GB free, critical under 5% or 1 GB.
- **Background jobs** (escalation and delivery, PM work orders, contract and repair-limit notices, the edit-history check) that have not finished well for three of their intervals.
- **Outside messages** that gave up or keep failing, by channel, and notification settings that cannot work. With no email, SMS or webhook set up, a warning that urgent reports reach only people who have the app open.

`HEARTBEAT_URL`: called after each check while the API and database answer, for a monitor elsewhere (an Uptime Kuma push monitor, healthchecks.io) that alerts when the calls stop, which is the only way to hear that the server itself is down. `SYSTEM_CHECKS=off` turns the checks off in an instance. Alerts are kept in `system_alerts`. Job health is per API process, so run one API instance per server, as the hospital install does.

### Dashboard

`/dashboard` (`GET /api/dashboard`, any staff role) is counted live from the database, optionally for one facility:

- **Devices**: in use, out of use (quarantined or being repaired) with the highest-risk ones listed first, and a count per status. Retired, condemned and disposed devices are not counted as inventory.
- **PM**: overdue, due in the next 30 days, devices without a PM schedule, and compliance (the share of scheduled devices that are not overdue). The overdue list shows whether a work order is already open.
- **Work orders**: open, urgent, not assigned, waiting for parts; opened and completed per week over 8 weeks.
- **Time to repair**: mean and median hours from report to completion, for repairs finished in the last 90 days.
- **Uptime**: the share of time in service that devices were in use over the last 30 days (from each device's status history), against the target (`UPTIME_TARGET_PERCENT`, 95% by default as for a district hospital), and the NHSRC census figure (devices working now, of those in service).
- **Repairs past their limit**: open breakdowns past, or near, their repair limit, with how long they have waited.

### Preventive maintenance schedule

A device is on the PM schedule once it has a next-PM date, set from its PM interval when it is added or when a PM work order is completed. Every hour the API opens a PM work order for each device whose PM falls due within `PM_LEAD_DAYS` (default 14) and has none open. The work order is scheduled for the due date. Biomed at that facility gets one notice per run listing the devices. The database allows one scheduled work order per device and due date, so several API instances never open the same one twice.

- Cancelling a scheduled PM work order means "not this time": it is not reopened, and the device stays overdue until a PM is recorded. Use **Open work order** on the PM schedule to open one by hand.
- To keep a device off the schedule, clear its next-PM date. Devices with automatic work orders turned off (`autoGenerateWorkOrders`) still appear on the calendar, but nothing is opened for them.
- `/maintenance/schedule` shows a month calendar (due, work order open, overdue, done) and the overdue list. API: `GET /api/pm/schedule?from=&to=` (at most 93 days), `POST /api/pm/work-orders` (open one now), and `POST /api/pm/run` (administrators: run the hourly pass now, for example after an import).

| Variable | Meaning |
|---|---|
| `PM_LEAD_DAYS` | Open PM work orders this many days before they fall due (0–90, default 14). |
| `PM_JOBS` | `off` stops the hourly PM pass in this instance. |
| `DOWNTIME_LIMIT_CRITICAL_HOURS` | Hours to put right critical and life-saving equipment (critical or high criticality, or life support; default 72, as in the BMMP Model RFP). |
| `DOWNTIME_LIMIT_OTHER_HOURS` | Hours to put right everything else (default 168, seven days). |
| `UPTIME_TARGET_PERCENT` | The uptime target on the dashboard and uptime register (default 95; NHSRC sets 90 for CHCs and 80 for PHCs). |
| `TZ` | The hospital's time zone, for the due date written in work orders. |

### Service Entry Points

Run individual apps when iterating on specific surfaces:

```bash
# API (NestJS)
pnpm --filter @biotrakr/api dev

# Web (Next.js)
pnpm --filter @biotrakr/web dev
```

### Available Services

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs
- **ML Service** (experimental, if you start it yourself): http://localhost:8000

## 📚 Documentation

- [Installing at a hospital](./docs/DEPLOY-ONPREM.md)
- [Database migrations and the drift check](./apps/api/prisma/README.md)
- [QR Scanning Workflow](./docs/qr-scanning.md)
- [Device data pipeline](./docs/data-pipeline.md)
- API reference: http://localhost:3001/api/docs while the API runs in development

Files in `docs/` dated November 2025 (status and progress reports) are historical snapshots, not the current state.

## 🧪 Testing

```bash
# Run all tests for every package
pnpm test

# Run tests for a specific app
pnpm --filter @biotrakr/api test
pnpm --filter @biotrakr/web test

# Run the API end-to-end tests
pnpm --filter @biotrakr/api test:e2e
```

## 📦 Building

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter @biotrakr/web build
```

## 🤝 Contributing

Open a pull request against `main`. CI runs typecheck and tests for each app, the migration drift check and a smoke test of the hospital install.

## 📄 License

Proprietary - All rights reserved

## 👥 Team

- Product: [Product Lead]
- Engineering: [Tech Lead]
- DevOps: [DevOps Engineer]
