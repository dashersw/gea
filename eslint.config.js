import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Pin parser root so nested clones (e.g. `.claude/worktrees/*`) are not a second TSConfig root. */
const repoRoot = dirname(fileURLToPath(import.meta.url))

export default [
  {
    ignores: [
      '**/dist/**',
      'benchmark/dist-profile/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '.cursor/**',
      '.history/**',
      '**/out/**',
      'docs/.vitepress/cache/**',
      'docs/public/**',
      'website/docs/**',
      'website/playground/codemirror-bundle.js',
      'website/playground/gea-compiler-browser.js',
      'website/playground/gea-core.js',
      'website/playground/gea-playground-runtime.js',
      'website/playground/index.mjs.map',
      'tests/e2e/vendor/babel.min.js',
      '**/.claude/worktrees/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        tsconfigRootDir: repoRoot,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'prefer-rest-params': 'warn',
      'no-empty': 'warn',
      'no-self-assign': 'warn',
      'no-useless-assignment': 'warn',
      'no-regex-spaces': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },

  eslintPluginPrettierRecommended,
]
