import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    // This filesystem writes AppleDouble sidecars next to every file.
    ignores: ['extension/**', 'node_modules/**', 'docs/**', '**/._*'],
  },

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],

    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {jsx: true},
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        __DEV__: 'readonly',
        __TARGET_BROWSER__: 'readonly',
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
    },

    settings: {
      react: {version: 'detect'},
    },

    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
    },
  },

  prettier,
];
