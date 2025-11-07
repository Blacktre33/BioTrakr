# Asset QR Scanning Workflow

The QR scanning feature allows field engineers to capture an asset QR code from the browser dashboard, add contextual notes, and persist the event through the NestJS API. This document outlines the backend schema, API routes, and frontend flow so future contributors can extend the workflow.

## Backend Overview

- **Schema**: `asset_scan_logs` stores each scan with `asset_id`, the raw `qr_payload`, optional `notes`, `location_hint`, and `created_at` timestamp.
- **API Routes**:
  - `POST /api/assets/:assetId/scans` – validates the payload and inserts a new log.
  - `GET /api/assets/:assetId/scans` – returns logs in reverse chronological order.
- **Modules**: Implemented in `apps/api/src/assets`. The `AssetsService` enforces asset existence and Prisma handles persistence.
- **Testing**: Unit tests mock Prisma interactions (`assets.service.spec.ts`); an e2e suite overrides Prisma in-memory to validate happy-path requests (`assets-scans.e2e-spec.ts`).

## Frontend Flow

1. **Scanner Dialog** (`AssetScanWorkflow`)
   - Uses `@zxing/browser` to stream from the camera.
   - Parses asset IDs from URLs or bare UUIDs; falls back to manual entry when parsing fails.
   - Captured notes and location hints submit via React Query mutation to the API.

2. **History Card** (`AssetScanHistoryCard`)
   - Fetches scan logs with `useAssetScanLogs(assetId)` and surfaces the latest entries.
   - Displays raw payloads plus optional notes/location badges.

3. **Assets Page Integration**
   - `AssetsPageClient` renders the inventory table, the scan dialog trigger, and the scan history card.
   - The last scanned asset ID persists in page state to refresh history after each submission.

## Local Development Notes

- The scanner requires camera permissions; browsers block insecure contexts, so use HTTPS or `localhost` in development.
- Mock payload format: `medasset://asset/<asset-uuid>`. The extractor also accepts bare UUID strings.
- To run API tests without a real database, the e2e suite stubs Prisma; ensure you keep overrides in sync if you add new service methods.
- Frontend tests include unit coverage for the QR parsing helper (`asset-scan-workflow.test.ts`). Consider adding Playwright coverage once the API is fully wired.


