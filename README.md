# MedAsset Pro - Medical Device Asset Management Platform
> Next-generation healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.

## 🏗️ Project Structure

```
medasset-pro/
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

- `@medasset/types` – canonical domain types shared by API and web clients.
- `@medasset/config` – zod-based environment loaders to avoid hard-coded URLs.
- `@medasset/utils` – security helpers for hashing, token creation, and guards.
- `@medasset/ui` – design tokens to be leveraged by every surface.

### Dashboard Enhancements (Step 9)

- Live telemetry map renders shared RTLS mock data with breadcrumb trails so UI integration can progress ahead of device feeds.
- Maintenance planner surfaces seeded work orders with filtering and priority/status badges, ready for API wiring in later steps.

### Data Pipeline (Step 10)

- `docs/data-pipeline.md` outlines the ingestion contracts, Timescale-friendly storage schema, and configuration required to replace synthetic telemetry with live device feeds.
- Asset QR scans are logged via the `/assets/:id/scans` API and surfaced in the dashboard for rapid reconciliation and audit trails. See [`docs/qr-scanning.md`](./docs/qr-scanning.md) for implementation notes.

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

# Start infrastructure (PostgreSQL, Redis, etc.)
docker-compose up -d

# Run database migrations
cd apps/api
pnpm prisma migrate dev

# Start all services in development mode (via Turborepo)
pnpm dev

# Or run the ML service + tracking stack via Docker
docker-compose up ml-service mlflow
```

### Service Entry Points

Run individual apps when iterating on specific surfaces:

```bash
# API (NestJS)
pnpm --filter @medasset/api dev

# Web (Next.js)
pnpm --filter @medasset/web dev
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
pnpm --filter @medasset/api test
pnpm --filter @medasset/web test

# Run E2E tests (Playwright)
pnpm test:e2e
```

## 📦 Building

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter @medasset/web build
```

## 🤝 Contributing

Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

Proprietary - All rights reserved

## 👥 Team

- Product: [Product Lead]
- Engineering: [Tech Lead]
- DevOps: [DevOps Engineer]
