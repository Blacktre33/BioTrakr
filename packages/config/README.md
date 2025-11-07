# @medasset/config

Runtime-safe configuration loaders that validate environment variables using
`zod`. Each loader memoises the parsed values so API requests and background
jobs do not repeatedly parse environment state.

## Loaders

- `loadApiConfig()` – Validates port, database URLs, and CORS origins for the
  NestJS backend.
- `loadSecurityConfig()` – Centralises JWT and password hashing defaults.
- `loadWebConfig()` – Ensures `NEXT_PUBLIC_*` variables are supplied without
  falling back to hard-coded URLs.

```ts
import { loadApiConfig } from "@medasset/config";

const config = loadApiConfig();
console.log(config.port);
```

## Development

```bash
pnpm --filter @medasset/config build
```

