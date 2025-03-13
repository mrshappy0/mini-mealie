import pluginJs from '@eslint/js';
import pluginReact from 'eslint-plugin-react';
import pluginSecurity from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import autoImports from './.wxt/eslint-auto-imports.mjs';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/** @type {import('eslint').Linter.Config[]} */
export default [
    // { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx,css,html}"], // TODO: add css once @eslint/css 0.5.0 is
    {
        files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
        languageOptions: { globals: globals.browser },
        settings: {
            react: {
                version: 'detect',
                'jsx-runtime': 'automatic',
            },
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,
    {
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/jsx-no-undef': ['error', { allowGlobals: true }],
        },
    },
    pluginSecurity.configs.recommended,
    eslintPluginPrettierRecommended,
    autoImports,
];
