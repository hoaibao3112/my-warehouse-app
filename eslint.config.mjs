import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: [
            'node_modules/**',
            '.next/**',
            'out/**',
            'android/**',
            'lib/generated/**',
            'src-react-native/**',
        ],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            // TypeScript specific
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-empty-function': 'warn',
            '@typescript-eslint/ban-ts-comment': 'warn',

            // General
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'prefer-const': 'warn',
            'no-var': 'error',

            // React
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    }
)
