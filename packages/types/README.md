# @medasset/types

Shared TypeScript interfaces and utility unions for the MedAsset Pro
ecosystem. Centralising the data contracts keeps the NestJS API, Next.js web
app, and future mobile clients aligned with the Prisma data model while
providing security-oriented primitives (`AuthenticatedUser`, `Permission`,
etc.).

## Usage

```ts
import type { Asset, AuthenticatedUser } from "@medasset/types";

function acceptAsset(asset: Asset) {
  // ...
}
```

## Development

```bash
pnpm --filter @medasset/types build
```

The package builds using `tsup` and emits both ESM and CJS bundles alongside
type declarations under `dist/`.

