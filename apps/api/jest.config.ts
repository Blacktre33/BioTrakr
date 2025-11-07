/*
 * Jest configuration ensures TypeScript sources are transpiled via ts-jest so type annotations
 * (e.g. in specs) do not trigger parser errors during unit test runs.
 */
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@medasset/types$': '<rootDir>/../../../packages/types/src',
    '^@medasset/config$': '<rootDir>/../../../packages/config/src',
    '^@medasset/utils$': '<rootDir>/../../../packages/utils/src',
    '^@medasset/ui$': '<rootDir>/../../../packages/ui/src',
  },
};

export default config;
