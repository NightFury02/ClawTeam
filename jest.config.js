/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/packages/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '__tests__/integration/'],
  moduleNameMapper: {
    '^@clawteam/shared/(.*)$': '<rootDir>/packages/shared/$1',
    '^@clawteam/api/(.*)$': '<rootDir>/packages/api/src/$1',
    '^uuid$': require.resolve('uuid'),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  collectCoverageFrom: [
    'packages/api/src/message-bus/**/*.ts',
    '!packages/**/*.d.ts',
    '!packages/**/__tests__/**',
    '!packages/**/index.ts',
    '!packages/**/plugin.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    'packages/api/src/message-bus/websocket-manager.ts': {
      branches: 80,
      functions: 80,
      lines: 90,
      statements: 90,
    },
    'packages/api/src/message-bus/mocks.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
