# BioTrakr Web Application

The BioTrakr web client provides administrative dashboards, asset visibility, and reporting for healthcare teams.

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker (for running the API + database locally)

## Getting Started

```bash
# install dependencies from repository root
pnpm install

# run the API and supporting services (from repository root)
docker-compose up -d

# start the web client
dcd apps/web
pnpm dev
```

The application is typically served at http://localhost:3000. Configure the API base URL via `NEXT_PUBLIC_API_URL` so the shared config loader can validate the value (e.g., `http://localhost:3001/api`).

## Environment Variables

Copy `.env.local.example` to `.env.local` and set the values for your environment:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL for REST API requests |
| `NEXT_PUBLIC_WS_URL` | WebSocket endpoint for real-time updates |
| `NEXT_PUBLIC_AUTH0_*` | Authentication configuration placeholders |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js in development mode |
| `pnpm build` | Create an optimized production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | Run ESLint checks |
| `pnpm test` | Run Jest unit tests |
| `pnpm test:e2e` | Execute Playwright tests |

## Testing

- Unit/component tests use Jest with Testing Library (`pnpm test`).
- End-to-end tests use Playwright (`pnpm test:e2e`). The Playwright configuration automatically starts the Next.js dev server if needed.

## Project Structure

```
src/app/(auth)        # Authentication routes
src/app/(dashboard)   # Dashboard routes & layouts
src/components/ui     # Reusable UI primitives (shadcn inspired)
src/components/layout # Navigation & shell components
src/components/features
src/lib/api           # API client wrappers
src/lib/hooks         # React Query hooks
src/lib/stores        # Zustand store slices
```

## Design System

UI primitives are generated with shadcn/ui (New York style). Tailwind tokens live in `globals.css`, and utilities such as the `cn` helper are in `src/lib/utils.ts`.

## Notes

- React Query is preconfigured via `QueryProvider` in `app/layout.tsx`.
- Axios interceptors translate API errors into a typed `ApiError`.
- Leaflet is wired up through the `LocationMap` dashboard card as a foundation for RTLS visualizations.
