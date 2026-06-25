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
      'tests/reference/**',
      // Generated, git-ignored wasm-bindgen output for the -rs packages (e.g.
      // surface-rs): the wasm-bindgen glue plus the base64-embedded module.
      // Baked by `npm run wasm`; never linted.
      '**/src/wasm/**',
      // Agent orchestration scripts in tools/agents/docs/ — workflow JS files,
      // not TypeScript source, not subject to project lint rules.
      'tools/agents/docs/**/*.js',
      // Dispatch staging area: recovered test files are copied into their owning
      // packages by the worker; the staging copies keep their original relative
      // imports (which only resolve once placed) and are not source to lint.
      'tools/agents/docs/assignments/_recovered/**',
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
      // `/wasm/surface` covers the generated, git-ignored wasm-bindgen output
      // (glue + embedded bytes) imported by the -rs shims. It is baked by
      // `npm run wasm` (Rust), so it may be absent when linting; keep lint a
      // pure-JS concern that does not require the native bake to have run.
      'import/no-unresolved': ['error', { ignore: ['virtual:.*', '/wasm/surface'] }],
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
    // Build/verification scripts may log, and legitimately import workspace packages (e.g. the SDK
    // surface primitives) — the resolver maps those to package source, which the parent-import rule
    // would otherwise flag. Covers the root scripts/ dir and per-package script dirs alike.
    files: ['**/scripts/**'],
    rules: {
      'no-console': 'off',
      'import/no-relative-parent-imports': 'off',
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
    // apps, examples, tools, and tests are allowed to import from the engine barrel
    files: ['apps/**/*.{ts,tsx}', 'examples/**/*.{ts,tsx}', 'tools/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  prettierConfig,
];
