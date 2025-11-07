# @medasset/ui

Shared design tokens for MedAsset Pro. The module currently exports colour and
spacing primitives so new surfaces can adopt a consistent visual language
before the full component library lands.

```ts
import { colorTokens } from "@medasset/ui";

console.log(colorTokens.brandPrimary);
```

Run `pnpm --filter @medasset/ui build` to emit distributable packages via tsup.

