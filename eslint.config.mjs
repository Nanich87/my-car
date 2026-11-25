// @ts-check
import eslint from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
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
  {
    // след prettier, за да не бъде изключено от него
    plugins: { '@stylistic': stylistic },
    rules: {
      // условията винаги с { } на отделни редове (и циклите)
      curly: ['error', 'all'],
      // празен ред след всеки if
      '@stylistic/padding-line-between-statements': ['error', { blankLine: 'always', prev: 'if', next: '*' }],
    },
  },
)
