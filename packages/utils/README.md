# @medasset/utils

Utility functions shared across services. The initial focus is security:
password hashing, JWT helpers, and guard-friendly token parsing. Additional
cross-service helpers can live here as the codebase grows.

## Usage

```ts
import { hashPassword, createTokenPair } from "@medasset/utils";

const hash = await hashPassword("super-secret");
const tokens = createTokenPair(authenticatedUser);
```

## Testing

```bash
pnpm --filter @medasset/utils test
```

