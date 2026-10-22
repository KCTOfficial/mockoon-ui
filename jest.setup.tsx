// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => ({
    __esModule: true,
    default: ({
        value,
        onChange,
        language,
    }: {
        value?: string;
        onChange?: (value: string) => void;
        language?: string;
    }) => (
        <textarea
            data-testid="monaco-editor"
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            data-language={language}
        />
    ),
}));

// Mock PM2
jest.mock('pm2', () => ({
    connect: jest.fn((cb: (err: Error | null) => void) => cb(null)),
    start: jest.fn((opts: unknown, cb: (err: Error | null) => void) => cb(null)),
    stop: jest.fn((name: unknown, cb: (err: Error | null) => void) => cb(null)),
    delete: jest.fn((name: unknown, cb: (err: Error | null) => void) => cb(null)),
    list: jest.fn((cb: (err: Error | null, list: unknown[]) => void) => cb(null, [])),
    describe: jest.fn((name: unknown, cb: (err: Error | null, list: unknown[]) => void) => cb(null, [])),
    disconnect: jest.fn(),
}));

// Mock fs module for API route tests
const originalFs = jest.requireActual<typeof import('fs')>('fs');
const fsMock = {
    ...originalFs,
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => []),
    unlinkSync: jest.fn(),
};

// Type declarations for the global helpers below
declare global {
    // eslint-disable-next-line no-var
    var mockFs: () => typeof fsMock;
    // eslint-disable-next-line no-var
    var restoreFs: () => void;
}

// Store original implementations for restoration
let fsMockActive = false;

global.mockFs = () => {
    fsMockActive = true;
    return fsMock;
};

global.restoreFs = () => {
    fsMockActive = false;
};
