import type { Role } from './roles';

/** The caller, as established by JwtAuthGuard from a verified access token. */
export interface AuthUser {
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
}
