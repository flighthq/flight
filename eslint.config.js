import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';
import prettierConfig from 'eslint-config-prettier/flat';

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

      // General
      'no-console': 'warn',

      // Imports
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/no-unresolved': 'error',

      // Unicorn (tasteful subset)
      'unicorn/prefer-module': 'error',
    },

    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.eslint.json',
        },
      },
    },

    ignores: ['vitest.config.base.ts', 'dist', 'node_modules'],
  },

  prettierConfig,
];
