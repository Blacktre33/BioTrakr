// Safe defaults so the config loaders parse during tests. Real values win if set.
process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://127.0.0.1:3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test@localhost/test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-only-secret-at-least-32-characters-long';
process.env.PASSWORD_SALT_ROUNDS = process.env.PASSWORD_SALT_ROUNDS ?? '10';
