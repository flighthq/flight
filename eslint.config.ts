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
      'import/no-relative-parent-imports': 'error',

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

    ignores: ['dist', 'node_modules'],
  },

  {
    // Types should not include scoped imports, only relative
    files: ['packages/types/**/*.{ts,tsx}'],
    rules: {
      'import/no-relative-parent-imports': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@*/*'],
              message: 'Scoped imports are not allowed. Please avoid using @scope/pkg.',
            },
          ],
        },
      ],
    },
  },

  {
    // Allow deep relative paths in api packages, tests and vite/vitest config
    files: ['packages/api/**/*.{ts,tsx}', 'tests/**', '**/vite*.config*.ts'],
    rules: {
      'import/no-relative-parent-imports': 'off',
    },
  },

  prettierConfig,
];
