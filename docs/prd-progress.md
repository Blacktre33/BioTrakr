# BioTrakr PRD Progress Report

_Last updated: November 7, 2025_

This document captures the current implementation status against the Product Requirements Document (PRD) for BioTrakr. It is organized by major capability areas and roadmap phases defined in the PRD.

---

## 1. Foundation & Infrastructure (Phase 1)

| PRD Requirement | Status | Notes |
| --- | --- | --- |
| Monorepo structure with shared tooling | ✅ Completed | Turborepo + pnpm workspace in place; root scripts for lint/test/build configured. |
| Backend API scaffolding (NestJS + Prisma) | ✅ Completed | `AssetsService` with Prisma-backed CRUD, caching, checkout flows, and unit tests. |
| Postgres/Timescale + Redis stack | ✅ Completed | Docker Compose services with health checks; Timescale extensions enabled via init scripts. |
| CI pipeline for lint/test | ✅ Completed | GitHub Actions workflows for API, web, and ML service. |
| Documentation baseline | ✅ Completed | Root README + service-specific READMEs. |

**Key gaps / follow-up:**
- Shared package documentation now lives under `packages/*`; continue expanding usage notes as modules evolve.
- Automate database migrations in CI/CD pipeline (future work).

---

## 2. Asset Management & Web Experience (Phase 2)

| PRD Requirement | Status | Notes |
| --- | --- | --- |
| Asset registry (FR-1.1/1.2) | ✅ Completed | Prisma schema covers asset lifecycle fields, parent modules prepared. |
| Asset search/filter UI | ✅ Completed (MVP) | Next.js `assets` route with React Query mock data, status filters, loading/error states. |
| Dashboard overview | ✅ Completed (MVP) | Summary cards, utilization chart, location map placeholder using Leaflet. |
| Real-time location integration (FR-2) | ⚠️ Pending | Leaflet component scaffolded; real telemetry wiring planned in Phase 2. |
| QR scan capture & audit trail | ✅ Completed (MVP) | Browser-based QR scanner logs to `asset_scan_logs`, history visible on Assets dashboard. |
| Mobile apps | ⛔ Not started | Deferred per roadmap (Phase 2/3). |

**Security & Auth Prep:**
- Route groups (`(auth)/(dashboard)`) defined; login screen shell ready.
- Step 7 delivered shared security utilities and centralised env validation via `@biotrakr/config` and `@biotrakr/utils`.

---

## 3. Predictive Maintenance & ML (Phase 3)

| PRD Requirement | Status | Notes |
| --- | --- | --- |
| ML microservice (FastAPI) | ✅ Completed | `/inference` and `/training` endpoints with synthetic bootstrap pipeline. |
| MLflow experiment tracking | ✅ Completed | Local MLflow server via docker-compose; model registry fallback logic implemented. |
| Training pipeline (FR-3) | ✅ Completed (baseline) | Gradient Boosting classifier on synthetic data; metrics logged, model versioned. |
| Data ingestion from Timescale/IoT | ⚠️ Pending | Synthetic dataset placeholder; integration planned with real telemetry. |

---

## 4. DevOps & Deployment

| PRD Requirement | Status | Notes |
| --- | --- | --- |
| Docker images for services | ✅ Completed | API & web already supported; ML service Dockerfile added, compose integration done. |
| Kubernetes manifests | ⚠️ Pending | API templates exist; ML service manifests to follow post-shared packages. |
| Monitoring & logging (Datadog/Sentry) | ⚠️ Pending | Logging scaffold uses structlog; external integration TBD. |

---

## 5. Upcoming Work (Q4 2025)

1. **Step 7 – Shared Packages & Security Foundations** ✅
   - `@biotrakr/types`, `@biotrakr/config`, and `@biotrakr/utils` publish shared tooling with tsup builds.
   - API/web consume the new loaders and no longer depend on hard-coded API URLs.

2. **Authentication & Authorization (Step 8)**
   - Integrate Auth0/Cognito, implement RBAC, secure ML service endpoints.

3. **Real-Time Location & Maintenance Enhancements (Step 9)** ✅
   - Leaflet map renders shared telemetry snapshots with breadcrumb trails and dynamic imports for SSR compatibility.
   - Maintenance planner UI surfaces seeded tasks with filtering, priority/status badges, and real-time polling.
   - Asset location pings and maintenance task models integrated with Prisma schema and seed data.

4. **Data Pipeline Integration (Step 10)** ✅
   - Telemetry ingestion schema (`telemetry_ingest_events`, `maintenance_event_logs`, `asset_scan_logs`) with Prisma migrations applied.
   - Pipeline config loader (`@biotrakr/config`) validates Timescale/queue settings for orchestration.
   - Dashboard pipeline monitor (`/pipeline`) displays ingest events, config snapshot, and maintenance timeline.
   - `TelemetryIngestionService` processes pending events into curated `asset_location_pings`.
   - QR scanning workflow integrated: browser-based scanner with `@zxing/browser`, API endpoints (`POST/GET /assets/:id/scans`), and scan history card on Assets page.

5. **Mobile Applications (Phase 2/3)**
   - Expo scaffolding pending; will reuse shared config/types once available.

---

## Summary

- Foundation and core asset workflows are in place across backend, web, and ML domains.
- ML service delivers MVP predictive maintenance with MLflow registry support.
- Docker/Compose & CI coverage span all major services.
- Security/auth groundwork landed in Step 7; identity integration remains queued next.
- Real-time telemetry map and maintenance planner use shared mocks while RTLS + API wiring is prepared for rollout.
- QR scanning workflow enables rapid asset verification and audit trails directly from the dashboard.
- Pipeline monitor surfaces ingestion status and config for operational visibility during data integration rollout.

This status page will be updated as new phases (shared packages, auth, mobile, integrations) progress. For detailed task tracking, refer to project TODO lists or GitHub project boards.
