import css from '@eslint/css';
import pluginJs from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginReact from 'eslint-plugin-react';
import pluginSecurity from 'eslint-plugin-security';
import importSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import autoImports from './.wxt/eslint-auto-imports.mjs';

/** @type {import('eslint').Linter.Config[]} */
export default [
    { ...pluginJs.configs.recommended, files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ['**/*.{js,ts,jsx,tsx}'],
    })),
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
        },
    },
    { ...pluginReact.configs.flat.recommended, files: ['**/*.{js,ts,jsx,tsx}'] },
    {
        files: ['**/*.{js,ts,jsx,tsx}'],
        plugins: {
            'simple-import-sort': importSort,
        },
        rules: {
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
        },
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
        languageOptions: { globals: globals.browser },
        settings: {
            react: {
                version: 'detect',
                'jsx-runtime': 'automatic',
            },
        },
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/jsx-no-undef': ['error', { allowGlobals: true }],
        },
    },
    {
        files: ['**/*.css'],
        language: 'css/css',
        plugins: {
            css,
        },
        rules: {
            ...css.configs.recommended.rules,
            'css/require-baseline': 'off',
        },
    },
    { ...pluginSecurity.configs.recommended, files: ['**/*.{js,ts,jsx,tsx}'] },
    { ...eslintPluginPrettierRecommended, files: ['**/*.{js,ts,jsx,tsx}'] },
    autoImports,
    {
        ignores: ['node_modules', '.wxt', '.output', 'coverage', 'html', 'coverage-report'],
    },
];
