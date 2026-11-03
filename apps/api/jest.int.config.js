/** Integration tests against a real Postgres 16 running as an embedded process (no Docker). */
const unit = require('./jest.config');

module.exports = {
  ...unit,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  globalSetup: '<rootDir>/test/int/global-setup.mjs',
  globalTeardown: '<rootDir>/test/int/global-teardown.mjs',
  testTimeout: 60_000,
  coverageThreshold: undefined,
};
