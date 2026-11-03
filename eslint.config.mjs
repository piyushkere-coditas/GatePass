import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'e2e/**', 'docs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Production code must use the injectable Clock, never `new Date()` directly (see docs/specs/TESTING.md §3).
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the injected Clock (or pass `now`) instead of `new Date()`.',
        },
      ],
    },
  },
  {
    // Tests, the clock itself and one-off scripts may read the real time.
    files: [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/test/**',
      '**/clock.ts',
      '**/prisma/seed.ts',
      // Local dev tooling (mailbox, embedded DB, E2E stack), never part of the deployed app.
      'apps/api/scripts/**',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.config.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
