import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.git/**',
      '**/.idea/**',
      '**/.vscode/**',
      '**/.claude/**',
      '**/worktrees/**',
    ],
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
      'import/no-unresolved': ['error', { ignore: ['virtual:.*'] }],
      'import/no-relative-parent-imports': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@flighthq/sdk',
              message: 'Import from specific packages directly. @flighthq/sdk is only for use in examples.',
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

    ignores: ['dist', 'node_modules', '.git', '.idea', '.vscode', '.claude', 'worktrees'],
  },

  {
    // Types should not include scoped imports, only relative
    files: ['packages/types/**/*.{ts,tsx}'],
    rules: {
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

  {
    // Allow console in scripts
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    // test files can have console, and use any, and undeclared variables
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },

  {
    // examples, tools, and tests are allowed to import from the engine barrel
    files: ['examples/**/*.{ts,tsx}', 'tools/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  prettierConfig,
];
