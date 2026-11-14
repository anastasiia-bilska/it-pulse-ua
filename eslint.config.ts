import js from '@eslint/js';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ---- constants ---------------------------------------------------------------------------------

/**
 * Feature-Sliced layers of the web app, top to bottom (ADR 0014). A layer imports only the layers
 * below it, and another slice only through its index.ts.
 */
const WEB_LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

// ---- functions ---------------------------------------------------------------------------------

/** no-restricted-imports for one web layer: nothing from the layers above, no deep slice imports. */
function webLayerRules(layer: string): Linter.RulesRecord {
  const above = WEB_LAYERS.slice(0, WEB_LAYERS.indexOf(layer));
  const upward =
    above.length === 0
      ? []
      : [
          {
            regex: `(?:^|/)(?:${above.join('|')})/`,
            message: `${layer} may only import from the layers below it (ADR 0014).`,
          },
        ];
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...upward,
          {
            regex: String.raw`^(?:\.\./)+(?:pages|widgets|features|entities|shared)/[^/]+/(?!(?:index|testing)\.ts$).+`,
            message: 'Import another slice through its index.ts (testing.ts in tests) (ADR 0014).',
          },
        ],
      },
    ],
  };
}

// ---- config ------------------------------------------------------------------------------------

// Engineering rules behind this config: CLAUDE.md. Why these tools: ADR 0006.
export default defineConfig(
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  {
    plugins: { perfectionist },
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
      // Modular architecture: other modules are reached only through their public API,
      // `index.ts` (tests may also use `testing.ts`). See CLAUDE.md.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^\.\./(?:\.\./)?[^./][^/]*/(?!index\.ts$|testing\.ts$)[^/]+$`,
              message: 'Import another module through its index.ts (or testing.ts in tests).',
            },
          ],
        },
      ],
      // Named functions are declarations; arrows are for inline callbacks only.
      'func-style': ['error', 'declaration'],
      // File layout: types first, then functions (constants by convention, see CLAUDE.md).
      // Order inside a group stays as written: top-down, in call order.
      'perfectionist/sort-modules': [
        'error',
        { type: 'unsorted', groups: [['interface', 'type'], 'class', 'function'] },
      ],
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
    // The browser app (ADR 0014): React function components, DOM globals.
    files: ['web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
    rules: {
      // React's own names: component props are `props`-like objects and refs are `ref`.
      'unicorn/name-replacements': ['error', { allowList: { db: true, props: true, ref: true } }],
      // ADR 0011: the page renders data as text only, never as HTML.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render data as text (ADR 0011).',
        },
      ],
    },
  },
  ...WEB_LAYERS.map((layer) => ({
    files: [`web/src/${layer}/**/*.{ts,tsx}`],
    rules: webLayerRules(layer),
  })),
  {
    // Tests read as scenarios: long arrange/act/assert blocks and inline fixture builders are fine.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.itest.ts'],
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
