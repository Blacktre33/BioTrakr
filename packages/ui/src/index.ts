/**
 * Shared design tokens live here so the dashboard, marketing site, and future
 * mobile app stay visually consistent. As the design system matures the
 * structure can expand to include component primitives.
 */
export const colorTokens = {
  brandPrimary: "#0B5FFF",
  brandSecondary: "#15C5B0",
  surface: "#111827",
  surfaceAlt: "#1F2937",
  border: "#374151",
  focusRing: "#A855F7",
} as const;

export const spacingScale = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export type ColorToken = keyof typeof colorTokens;
export type SpacingToken = keyof typeof spacingScale;
