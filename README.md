# BioTrakr - Medical Device Asset Management Platform
> Next-generation healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.

## 🏗️ Project Structure

```
biotrakr/
├── apps/
│   ├── api/              # NestJS backend API
│   ├── web/              # Next.js web application
│   ├── mobile/           # React Native mobile app
│   └── ml-service/       # Python FastAPI ML service
├── packages/
│   ├── ui/               # Shared UI components
│   ├── types/            # Shared TypeScript types
│   ├── config/           # Shared configuration
│   └── utils/            # Shared utilities
├── infrastructure/
│   ├── docker/           # Docker configurations
│   ├── kubernetes/       # K8s manifests
│   └── terraform/        # Infrastructure as Code
└── docs/                 # Documentation
```

### Shared Packages

- `@biotrakr/types` – canonical domain types shared by API and web clients.
- `@biotrakr/config` – zod-based environment loaders to avoid hard-coded URLs.
- `@biotrakr/utils` – security helpers for hashing, token creation, and guards.
- `@biotrakr/ui` – design tokens to be leveraged by every surface.

### Dashboard Enhancements (Step 9)

- Live telemetry map renders shared RTLS mock data with breadcrumb trails so UI integration can progress ahead of device feeds.
- Maintenance planner surfaces seeded work orders with filtering and priority/status badges, ready for API wiring in later steps.

### Data Pipeline (Step 10)

- `docs/data-pipeline.md` outlines the ingestion contracts, Timescale-friendly storage schema, and configuration required to replace synthetic telemetry with live device feeds.
- Asset QR scans are logged via the `/assets/:id/scans` API and surfaced in the dashboard for rapid reconciliation and audit trails. See [`docs/qr-scanning.md`](./docs/qr-scanning.md) for implementation notes.

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

# Start infrastructure (PostgreSQL/TimescaleDB, Redis, etc.)
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
| `admin` | Everything, including ingestion |
| `engineer` | Read; create/edit assets; Excel import |
| `technician`, `clinical_staff` | Read; record QR scans |
| `viewer` | Read only |
| `integration` | Ingestion endpoints only (RTLS/telemetry gateways) |

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

Biomed sees notices in the app's bell: problem reports on their facility's devices, device faults that took a device out of use, work assigned to them. Reporters hear when their report is fixed or closed. An urgent report (a critical device, or a high-risk device taken out of use) that nobody takes on is escalated to engineers and administrators after 15 and again after 60 minutes.

Urgent notices can also go to your own gateway (SMS, WhatsApp, pager) as a signed webhook:

| Variable | Meaning |
|---|---|
| `NOTIFY_WEBHOOK_URL` | Where to POST urgent notices. Unset: in-app only. |
| `NOTIFY_WEBHOOK_SECRET` | At least 16 characters. Required with the URL; nothing is sent unsigned. |
| `APP_URL` | Public address of the web app, used for links in messages. |
| `NOTIFY_ESCALATE_MINUTES` | Escalation steps, default `15,60`. |
| `NOTIFY_JOBS` | `off` stops escalation and delivery in this instance (they run every 30 s). |

Each POST carries `X-BioTrakr-Timestamp` and `X-BioTrakr-Signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>` with the secret. Check it, reject timestamps older than a few minutes, and de-duplicate on the body's `id` (it is signed; retries reuse it). The body has the title, severity, device, a link and the recipients' names, roles, phones and emails so the gateway can reach them; what ward staff typed is not included (it may name a patient). Keep the gateway inside the hospital network.

Delivery: a timeout, network error, 408, 429 or 5xx is retried with backoff (8 attempts over about an hour); any other 3xx/4xx is final (redirects are not followed). Either way the outcome is logged. Sent and failed messages are deleted after 7 days, in-app notices after 90.

Escalation and delivery run inside the API process every 30 s, so the API must run as a long-lived service (not serverless). Faults reported by devices take the device out of use and notify biomed once; they are not escalated, because no work order exists for them yet.

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
- **ML Service**: http://localhost:8000
- **ML Docs**: http://localhost:8000/docs
- **MLflow UI**: http://localhost:5001

## 📚 Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Setup Guide](./docs/SETUP.md)
- [API Documentation](./docs/API.md)
- [QR Scanning Workflow](./docs/qr-scanning.md)
- [Contributing Guidelines](./docs/CONTRIBUTING.md)

## 🧪 Testing

```bash
# Run all tests for every package
pnpm test

# Run tests for a specific app
pnpm --filter @biotrakr/api test
pnpm --filter @biotrakr/web test

# Run E2E tests (Playwright)
pnpm test:e2e
```

## 📦 Building

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter @biotrakr/web build
```

## 🤝 Contributing

Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

Proprietary - All rights reserved

## 👥 Team

- Product: [Product Lead]
- Engineering: [Tech Lead]
- DevOps: [DevOps Engineer]
