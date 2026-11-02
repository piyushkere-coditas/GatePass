/** Unit tests: pure logic, no database. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  // Use shared sources directly so TDD doesn't need a shared rebuild.
  moduleNameMapper: { '^@gatepass/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  // Gate the pure state machine at 100%. VisitStateService is covered by integration tests (SM-I-*).
  coverageThreshold: {
    './src/visits/state/visit-state.machine.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
