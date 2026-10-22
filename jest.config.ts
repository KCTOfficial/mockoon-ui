import type { Config } from 'jest';

const config: Config = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.tsx'],
    testEnvironment: 'jest-environment-jsdom',
    moduleNameMapper: {
        // Handle module aliases
        '^@/(.*)$': '<rootDir>/$1',
        // jsdom would otherwise pick yaml's ESM browser build
        '^yaml$': '<rootDir>/node_modules/yaml/dist/index.js',
        '^uuid$': '<rootDir>/__mocks__/uuid.js',
        // Handle CSS modules (with CSS modules)
        '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
        // Handle CSS imports (without CSS modules)
        '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
        // Handle image imports
        '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    },
    testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/mockoon/'],
    transform: {
        // Use ts-jest for TypeScript files
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: {
                jsx: 'react-jsx',
                module: 'ESNext',
                moduleResolution: 'bundler',
                allowImportingTsExtensions: true,
                noEmit: true,
                paths: {
                    '@/*': ['./*']
                }
            }
        }]
    },
    transformIgnorePatterns: [
        '/node_modules/',
        '^.+\\.module\\.(css|sass|scss)$',
    ],
    collectCoverageFrom: [
        'server/**/*.ts',
        'src/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.ts',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/mockoon/**',
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },
};

export default config;
