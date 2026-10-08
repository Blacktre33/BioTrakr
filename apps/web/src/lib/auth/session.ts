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
