/**
 * BioTrakr UI Design System
 * 
 * Shared design tokens and utilities for BioTrakr applications.
 * This ensures consistent visual language across web, mobile, and future platforms.
 */

// Color Tokens
export const colorTokens = {
  // Brand Colors
  brandPrimary: "#0B5FFF",
  brandSecondary: "#15C5B0",
  brandAccent: "#A855F7",
  
  // Surface Colors
  surface: "#111827",
  surfaceAlt: "#1F2937",
  surfaceElevated: "#374151",
  
  // Border & Divider
  border: "#374151",
  borderLight: "#4B5563",
  divider: "#E5E7EB",
  
  // Focus & Selection
  focusRing: "#A855F7",
  selection: "#3B82F6",
  
  // Status Colors
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  
  // Text Colors
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textInverse: "#FFFFFF",
} as const;

// Spacing Scale
export const spacingScale = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
} as const;

// Typography Scale
export const typographyScale = {
  xs: "0.75rem",    // 12px
  sm: "0.875rem",   // 14px
  base: "1rem",     // 16px
  lg: "1.125rem",   // 18px
  xl: "1.25rem",    // 20px
  "2xl": "1.5rem",  // 24px
  "3xl": "1.875rem", // 30px
  "4xl": "2.25rem", // 36px
} as const;

// Border Radius
export const borderRadius = {
  none: "0",
  sm: "0.125rem",   // 2px
  base: "0.25rem",  // 4px
  md: "0.375rem",   // 6px
  lg: "0.5rem",     // 8px
  xl: "0.75rem",    // 12px
  "2xl": "1rem",    // 16px
  full: "9999px",
} as const;

// Shadows
export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  base: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
} as const;

// Z-Index Scale
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;

// Breakpoints (for reference, actual breakpoints should be in Tailwind config)
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// Animation Durations
export const animationDuration = {
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

// Type Exports
export type ColorToken = keyof typeof colorTokens;
export type SpacingToken = keyof typeof spacingScale;
export type TypographyToken = keyof typeof typographyScale;
export type BorderRadiusToken = keyof typeof borderRadius;
export type ShadowToken = keyof typeof shadows;
export type ZIndexToken = keyof typeof zIndex;
export type BreakpointToken = keyof typeof breakpoints;
export type AnimationDurationToken = keyof typeof animationDuration;

// Utility Functions
export const getColor = (token: ColorToken): string => colorTokens[token];
export const getSpacing = (token: SpacingToken): number => spacingScale[token];
export const getTypography = (token: TypographyToken): string => typographyScale[token];
export const getBorderRadius = (token: BorderRadiusToken): string => borderRadius[token];
export const getShadow = (token: ShadowToken): string => shadows[token];
export const getZIndex = (token: ZIndexToken): number => zIndex[token];
