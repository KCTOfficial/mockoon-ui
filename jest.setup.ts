// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
    useRouter() {
        return {
            push: jest.fn(),
            replace: jest.fn(),
            prefetch: jest.fn(),
            back: jest.fn(),
            forward: jest.fn(),
            refresh: jest.fn(),
        };
    },
    useSearchParams() {
        return new URLSearchParams();
    },
    usePathname() {
        return '/';
    },
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: any) => {
        // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
        return <img { ...props } />;
    },
}));

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => ({
    __esModule: true,
    default: ({ value, onChange, language }: any) => (
        <textarea
      data - testid= "monaco-editor"
      value={ value || ''
}
      onChange = {(e: any) => onChange?.(e.target.value)}
    data - language={ language }
    />
  ),
}));

// Mock PM2
jest.mock('pm2', () => ({
    connect: jest.fn((cb: any) => cb(null)),
    start: jest.fn((opts: any, cb: any) => cb(null)),
    stop: jest.fn((name: any, cb: any) => cb(null)),
    delete: jest.fn((name: any, cb: any) => cb(null)),
    list: jest.fn((cb: any) => cb(null, [])),
    describe: jest.fn((name: any, cb: any) => cb(null, [])),
    disconnect: jest.fn(),
}));

// Mock fs module for API route tests
const originalFs = jest.requireActual('fs');
const mockFs = {
    ...originalFs,
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => []),
    unlinkSync: jest.fn(),
};

// Store original implementations for restoration
let fsMockActive = false;

global.mockFs = () => {
    fsMockActive = true;
    return mockFs;
};

global.restoreFs = () => {
    fsMockActive = false;
};

// Export for use in tests
export { mockFs };