/**
 * Keeps the signed-in session for this browser tab.
 *
 * Tokens live in sessionStorage (cleared when the tab closes) rather than
 * localStorage. Moving them to an httpOnly cookie set by the API would also
 * protect them from injected scripts; that is a follow-up.
 */
export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  /** Signed in with a one-time password: must choose their own first. */
  passwordChangeRequired?: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const KEY = 'biotrakr.session';

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode, blocked); the user will be asked to sign in again.
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Sends the user to the login page, remembering where they were. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * Only allow redirects back into this app. Parsing with URL (instead of
 * prefix checks) also catches tricks like "/\evil.com" or "/%09/evil.com",
 * which browsers resolve to another site.
 */
export function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  try {
    const url = new URL(raw, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.pathname === '/login' ||
      url.pathname === CHANGE_PASSWORD_PATH
    ) {
      return '/dashboard';
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return '/dashboard';
  }
}

/** Sends someone signed in with a one-time password to choose their own. */
export function redirectToChangePassword(): void {
  if (typeof window === 'undefined' || window.location.pathname === CHANGE_PASSWORD_PATH) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`${CHANGE_PASSWORD_PATH}?next=${next}`);
}

/** Readable role names for the people using the app. */
export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  engineer: "Biomedical engineer",
  technician: "Biomedical technician",
  clinical_staff: "Clinical staff",
  viewer: "Viewer",
  integration: "Integration",
};
