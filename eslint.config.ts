import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';

export default [
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],

    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.eslint.json'],
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      unicorn: unicornPlugin,
    },

    rules: {
      // TypeScript
      ...tseslint.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
      '@typescript-eslint/no-namespace': 'off',

      // General
      'no-console': 'warn',

      // Imports
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/no-unresolved': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Disallow relative imports from other packages
              group: ['packages/*', '../../*', '../../../*', '../../../../*', '!../../vitest.config.base.js'],
              message:
                'Do not import from packages via relative paths. Use scoped package imports instead (e.g. @scope/pkg).',
            },
          ],
        },
      ],

      // Unicorn
      'unicorn/prefer-module': 'error',
    },

    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.eslint.json'],
          // project: ['./tsconfig.eslint.json', 'packages/*/tsconfig.json'],
        },
      },
    },

    ignores: ['vitest.config.base.ts', 'dist', 'node_modules'],
  },

  prettierConfig,
];
