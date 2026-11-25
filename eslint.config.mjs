// @ts-check
import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/', 'platforms/', 'hooks/', '.test-dist/', 'webpack.config.js', 'references.d.ts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // неизползван параметър е позволен, ако започва с _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['error', 'log'] }],
    },
  },
  prettier,
)
