import type { UserRole } from '@biotrakr/types';

/** Every role the API recognises. `User.role` values outside this list cannot log in. */
export const ALL_ROLES = [
  'admin',
  'engineer',
  'technician',
  'clinical_staff',
  'viewer',
  'integration',
] as const satisfies readonly UserRole[];

export type Role = (typeof ALL_ROLES)[number];

/** People who use the app (everything except machine accounts). */
export const STAFF_ROLES: Role[] = [
  'admin',
  'engineer',
  'technician',
  'clinical_staff',
  'viewer',
];
/** May create and edit assets and run bulk imports. */
export const ASSET_EDITOR_ROLES: Role[] = ['admin', 'engineer'];
/** Biomedical engineering: may change a device's status and work on work orders. */
export const BIOMED_ROLES: Role[] = ['admin', 'engineer', 'technician'];
/** May record QR scans. */
export const SCAN_ROLES: Role[] = [
  'admin',
  'engineer',
  'technician',
  'clinical_staff',
];
/** May push telemetry, RTLS, maintenance and error events. */
export const INGESTION_ROLES: Role[] = ['admin', 'integration'];

/** Accepts legacy upper-case values (e.g. seed data "ADMIN"). */
export function normalizeRole(raw: string | null | undefined): Role | null {
  const value = (raw ?? '').trim().toLowerCase();
  return (ALL_ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null;
}
