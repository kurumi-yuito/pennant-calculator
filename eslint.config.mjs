import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['**/.nuxt/**', '**/.output/**', '**/.wrangler/**', '**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs', '**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        defineNuxtConfig: 'readonly',
        defineEventHandler: 'readonly',
        createError: 'readonly',
        $fetch: 'readonly',
        useFetch: 'readonly',
        useRoute: 'readonly',
        useRouter: 'readonly',
        useHead: 'readonly',
        definePageMeta: 'readonly',
      },
    },
    rules: {
      // TS の DOM lib 型（ShareData 等）は tsc/vue-tsc 側がより正確に検査するため、
      // TS ファイルでは core の no-undef を無効化する（typescript-eslint 公式推奨）。
      'no-undef': 'off',
    },
  },
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Prettier を入れていないため、整形のみのルールは無効化する
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
    },
  },
)
