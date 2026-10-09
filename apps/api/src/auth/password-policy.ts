export const MIN_PASSWORD_LENGTH = 10;

/** A few of the most common passwords; long enough ones still get past the length rule. */
const COMMON = new Set([
  'password123',
  'password1234',
  'qwertyuiop',
  '1234567890',
  '0123456789',
  '12345678910',
  'iloveyou123',
  'welcome123',
  'admin12345',
  'letmein123',
  'hospital123',
  'biotrakr123',
]);

/**
 * Why a new password is not acceptable, or null. Length matters most
 * (NIST SP 800-63B); no forced mixes of symbols, which push people to
 * predictable patterns.
 */
export function passwordProblem(
  password: string,
  email: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easier to remember.`;
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    return 'This password is too easy to guess. Choose another.';
  }
  const name = email.split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 4 && lower.includes(name)) {
    return 'Do not include your email name in your password.';
  }
  return null;
}
