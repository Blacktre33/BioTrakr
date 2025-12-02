# BioTrakr UI Integration Guide

## ✅ Status: Phase 2 Complete (Asset Scanning)

The frontend has been updated to include real-time asset scanning capabilities backed by the new API.

### 1. API Client Setup
The API client is configured in `apps/web/src/lib/api/client.ts`.
- **Base URL:** `http://localhost:3001/api` (Hardcoded for dev, should be environment variable in prod)
- **Timeout:** 15s
- **Auth:** Supports Bearer token (placeholder for now)

### 2. Asset Scanning Workflow
Located in `apps/web/src/components/assets/asset-scan-workflow.tsx`.

**Features:**
- QR Code scanning via webcam (using `@zxing/browser`)
- Manual Asset ID entry fallback
- Payload parsing (extracts UUIDs from URLs)
- Metadata capture (Location Hint, Notes)

**Usage:**
1. Navigate to the Assets Dashboard.
2. Click the **"Scan Asset QR"** button above the table.
3. Allow camera permissions.
4. Scan a QR code containing an Asset UUID.
5. Add optional notes/location.
6. Click "Log Scan".

**Data Flow:**
1. Frontend calls `POST /api/assets/:id/scans`
2. API validates ID and saves to `asset_scan_logs` table
3. React Query invalidates `['asset-scan-logs', id]` cache (ready for when detail view is implemented)

### 3. Next Steps (Phase 3)

#### A. Connect Asset Table to Real Data
The `AssetTable` currently accepts `assets` as a prop. You need to:
1. Create a page component (e.g., `apps/web/src/app/assets/page.tsx`) that uses `useQuery` to fetch assets from `GET /api/assets`.
2. Pass this data to `AssetTable`.

#### B. Authentication
The API currently uses a hardcoded user ID (`00000000...`).
1. Implement Login page.
2. Store JWT in local storage / cookie.
3. Update `client.ts` to attach `Authorization: Bearer <token>`.

#### C. Asset Detail View
Create a page at `/assets/[id]` that fetches:
- Asset details (`GET /api/assets/:id`)
- Scan history (`GET /api/assets/:id/scans`)
- Maintenance history
