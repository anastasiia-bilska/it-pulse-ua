import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Engineering rules behind this config: CLAUDE.md. Why these tools: ADR 0006.
export default defineConfig(
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Readability: small functions, shallow nesting, explicit control flow.
      complexity: ['error', 8],
      'max-depth': ['error', 2],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 3],
      'no-nested-ternary': 'error',
      eqeqeq: 'error',
      curly: ['error', 'all'],

      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variableLike', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],

      // `db` is the conventional name for a database client.
      'unicorn/name-replacements': ['error', { allowList: { db: true } }],
      // SQL NULL is a real value in this codebase (e.g. last_modified).
      'unicorn/no-null': 'off',
      // We document with standard TSDoc (/** … */ with asterisks), which these two rules forbid.
      'unicorn/single-line-block-comment-style': 'off',
      'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
      // String arrays are sorted by code unit on purpose: content hashes depend on that order.
      'unicorn/require-array-sort-compare': 'off',
    },
  },
  {
    // Tests read as scenarios: long arrange/act/assert blocks and inline fixture builders are fine.
    files: ['**/*.test.ts', '**/*.itest.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'unicorn/max-nested-calls': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/consistent-function-scoping': 'off',
      // before() hooks set up the shared server and clients that the scenarios use.
      'unicorn/no-top-level-assignment-in-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            {
              from: 'package',
              package: 'node:test',
              name: ['test', 'describe', 'before', 'after'],
            },
          ],
        },
      ],
    },
  },
  prettier,
);
