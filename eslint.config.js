import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint-define-config';
import importPlugin from 'eslint-plugin-import';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';

export default defineConfig([
    // General linting rules for TypeScript files
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: ['./tsconfig.eslint.json'], // Point to your dedicated linting tsconfig
            },
        },
        plugins: {
            '@typescript-eslint': typescriptEslintPlugin,
            unicorn: unicornPlugin,
            import: importPlugin,
            'simple-import-sort': simpleImportSortPlugin,
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_', // Ignore unused function arguments that start with "_"
                },
            ],
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-console': 'warn',
            'no-unused-vars': 'off',
            'unicorn/prefer-module': 'error',
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'import/no-unresolved': 'error',
            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                    'newlines-between': 'always',
                },
            ],
        },
        settings: {
            'import/resolver': {
                typescript: {
                    project: './tsconfig.eslint.json',
                },
                node: {
                    extensions: ['.js', '.ts', '.tsx'],
                },
            },
        },
        // Specify files to ignore
        ignores: [
            'vitest.config.base.ts',  // Ignore this specific file from linting
        ],
    },

    // Global settings for testing (if any)
    {
        files: ['**/*.test.{ts,tsx,js,jsx}'],
        languageOptions: {
            globals: {
                describe: true,
                it: true,
                expect: true,
                beforeEach: true,
                afterEach: true,
            },
        },
    },
]);
