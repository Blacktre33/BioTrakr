# BioTrakr UI Design System Guide

## Overview

`@biotrakr/ui` is the shared design system package for BioTrakr applications. It provides design tokens, utilities, and ensures visual consistency across web, mobile, and future platforms.

## Installation

The package is already integrated into the web application via workspace linking:

```json
{
  "dependencies": {
    "@biotrakr/ui": "workspace:*"
  }
}
```

## Usage

### Import Design Tokens

```typescript
import { 
  colorTokens, 
  spacingScale, 
  typographyScale,
  borderRadius,
  shadows,
  zIndex 
} from "@biotrakr/ui";

// Or use the re-export from lib
import { colorTokens, spacingScale } from "@/lib/ui-tokens";
```

### Color Tokens

```typescript
import { colorTokens } from "@biotrakr/ui";

// Brand Colors
colorTokens.brandPrimary    // "#0B5FFF"
colorTokens.brandSecondary  // "#15C5B0"
colorTokens.brandAccent     // "#A855F7"

// Status Colors
colorTokens.success         // "#10B981"
colorTokens.warning         // "#F59E0B"
colorTokens.error           // "#EF4444"
colorTokens.info            // "#3B82F6"

// Text Colors
colorTokens.textPrimary     // "#111827"
colorTokens.textSecondary   // "#6B7280"
colorTokens.textTertiary    // "#9CA3AF"
```

**Example:**
```tsx
<div style={{ backgroundColor: colorTokens.brandPrimary }}>
  Brand colored element
</div>
```

### Spacing Scale

```typescript
import { spacingScale } from "@biotrakr/ui";

spacingScale.xs    // 4px
spacingScale.sm    // 8px
spacingScale.md    // 16px
spacingScale.lg    // 24px
spacingScale.xl    // 32px
spacingScale["2xl"] // 48px
spacingScale["3xl"] // 64px
```

**Example:**
```tsx
<div style={{ padding: spacingScale.md }}>
  Content with medium padding
</div>
```

### Typography Scale

```typescript
import { typographyScale } from "@biotrakr/ui";

typographyScale.xs     // "0.75rem" (12px)
typographyScale.sm     // "0.875rem" (14px)
typographyScale.base   // "1rem" (16px)
typographyScale.lg     // "1.125rem" (18px)
typographyScale.xl     // "1.25rem" (20px)
typographyScale["2xl"] // "1.5rem" (24px)
typographyScale["3xl"] // "1.875rem" (30px)
typographyScale["4xl"] // "2.25rem" (36px)
```

**Example:**
```tsx
<p style={{ fontSize: typographyScale.lg }}>
  Large text
</p>
```

### Border Radius

```typescript
import { borderRadius } from "@biotrakr/ui";

borderRadius.sm     // "0.125rem" (2px)
borderRadius.base   // "0.25rem" (4px)
borderRadius.md     // "0.375rem" (6px)
borderRadius.lg     // "0.5rem" (8px)
borderRadius.xl     // "0.75rem" (12px)
borderRadius["2xl"] // "1rem" (16px)
borderRadius.full   // "9999px"
```

**Example:**
```tsx
<div style={{ borderRadius: borderRadius.lg }}>
  Rounded element
</div>
```

### Shadows

```typescript
import { shadows } from "@biotrakr/ui";

shadows.sm    // Small shadow
shadows.base  // Base shadow
shadows.md    // Medium shadow
shadows.lg    // Large shadow
shadows.xl    // Extra large shadow
```

**Example:**
```tsx
<div style={{ boxShadow: shadows.md }}>
  Element with shadow
</div>
```

### Z-Index Scale

```typescript
import { zIndex } from "@biotrakr/ui";

zIndex.base          // 0
zIndex.dropdown      // 1000
zIndex.sticky        // 1020
zIndex.fixed         // 1030
zIndex.modalBackdrop // 1040
zIndex.modal         // 1050
zIndex.popover       // 1060
zIndex.tooltip       // 1070
```

**Example:**
```tsx
<div style={{ zIndex: zIndex.modal }}>
  Modal content
</div>
```

## Utility Functions

```typescript
import { 
  getColor, 
  getSpacing, 
  getTypography,
  getBorderRadius,
  getShadow,
  getZIndex 
} from "@biotrakr/ui";

// Type-safe getters
const primaryColor = getColor("brandPrimary");
const mediumSpacing = getSpacing("md");
const largeFont = getTypography("lg");
```

## CSS Variables

BioTrakr design tokens are also available as CSS variables in `globals.css`:

```css
:root {
  --biotrakr-primary: #0B5FFF;
  --biotrakr-secondary: #15C5B0;
  --biotrakr-accent: #A855F7;
  --biotrakr-success: #10B981;
  --biotrakr-warning: #F59E0B;
  --biotrakr-error: #EF4444;
  --biotrakr-info: #3B82F6;
}
```

**Usage in CSS:**
```css
.my-element {
  background-color: var(--biotrakr-primary);
  color: var(--biotrakr-text-inverse);
}
```

## TypeScript Types

All tokens have corresponding TypeScript types for type safety:

```typescript
import type { 
  ColorToken, 
  SpacingToken, 
  TypographyToken,
  BorderRadiusToken,
  ShadowToken,
  ZIndexToken 
} from "@biotrakr/ui";

function useColor(token: ColorToken) {
  return colorTokens[token];
}
```

## Integration with Tailwind CSS

The design tokens work seamlessly with Tailwind CSS. You can use them in inline styles or extend your Tailwind config:

```typescript
// tailwind.config.ts
import { colorTokens, spacingScale } from "@biotrakr/ui";

export default {
  theme: {
    extend: {
      colors: {
        'biotrakr-primary': colorTokens.brandPrimary,
        'biotrakr-secondary': colorTokens.brandSecondary,
      },
      spacing: spacingScale,
    },
  },
};
```

## Example Component

See `apps/web/src/components/examples/biotrakr-ui-example.tsx` for a complete example demonstrating all design tokens.

## Building the Package

To build the UI package:

```bash
cd packages/ui
pnpm build
```

This generates TypeScript declarations and compiled JavaScript in the `dist` folder.

## Best Practices

1. **Use tokens instead of hardcoded values** - This ensures consistency and makes theme changes easier
2. **Import from `@biotrakr/ui` directly** - Or use the re-export from `@/lib/ui-tokens`
3. **Use TypeScript types** - Leverage the type system for better autocomplete and error checking
4. **Combine with Tailwind** - Use tokens for dynamic values, Tailwind classes for static styling
5. **Keep tokens centralized** - All design decisions should flow through the UI package

## Future Enhancements

- React component primitives
- Theme switching (light/dark)
- Animation utilities
- Responsive breakpoint helpers
- Icon library integration

