const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

require("./helpers/setup.cjs");

const {
  createTokenPair,
  getBearerToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
} = require("../dist/utils/src/index.js");

process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "super-secret-key-used-for-test-only-1234567890";
process.env.JWT_ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TOKEN_TTL ?? "60";
process.env.JWT_REFRESH_TOKEN_TTL =
  process.env.JWT_REFRESH_TOKEN_TTL ?? "120";
process.env.PASSWORD_SALT_ROUNDS = process.env.PASSWORD_SALT_ROUNDS ?? "10";

const baseUser = {
  id: "user-id",
  organizationId: "org-id",
  role: "admin",
  permissions: [{ name: "assets:read" }],
  email: "user@example.com",
  firstName: "Test",
  lastName: "User",
  sessionIssuedAt: Math.floor(Date.now() / 1000),
};

describe("security helpers", () => {
  test("hashes and verifies passwords using bcrypt", async () => {
    const password = "CorrectHorseBatteryStaple!";
    const hash = await hashPassword(password);

    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });

  test("creates token pairs that validate successfully", () => {
    const pair = createTokenPair(baseUser);
    const claims = verifyAccessToken(pair.accessToken);

    assert.equal(claims.sub, baseUser.id);
    assert.deepEqual(claims.permissions, baseUser.permissions);
  });

  test("extracts bearer tokens from authorization headers", () => {
    assert.equal(getBearerToken("Bearer sample-token"), "sample-token");
    assert.throws(() => getBearerToken("Basic foo"));
  });
});

