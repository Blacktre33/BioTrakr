import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const customConfig: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverage: false,
  // src_old_backup is the pre-rewrite UI, kept for reference only.
  testPathIgnorePatterns: ["<rootDir>/tests/", "<rootDir>/src_old_backup/"],
};

export default createJestConfig(customConfig);
