/** Unit tests: pure logic, no database. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  // Use shared sources directly so TDD doesn't need a shared rebuild.
  moduleNameMapper: { '^@gatepass/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageThreshold: {
    './src/visits/state/': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
