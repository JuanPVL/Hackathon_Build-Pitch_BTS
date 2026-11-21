/** Dos proyectos: unit (sin base) y e2e (PostgreSQL LOCAL con 01..05 + stubs de Supabase). */
const tsJest = { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] };
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: tsJest,
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      transform: tsJest,
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/e2e/global-setup.ts',
      testTimeout: 30000,
    },
  ],
};
