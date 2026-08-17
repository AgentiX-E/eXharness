import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.mjs', '**/*.cjs'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // `any` is confined to type-erasure boundaries (the typed event bus) and
      // pragmatic test casts; it is not a correctness risk here.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Empty interfaces are the declaration-merging extension points for the
      // typed `Services` and `Events` registries.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
      // `cursor`/`scope` are legitimate parent-chain walk aliases, not nested-function captures.
      '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['self', 'that', 'cursor', 'scope'] }],
    },
  },
)
