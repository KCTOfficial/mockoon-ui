/**
 * @jest-environment node
 */
import { POST, GET } from '@/server/api/environments/create';

// Mock fs module
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        existsSync: jest.fn(),
        writeFileSync: jest.fn(),
        readdirSync: jest.fn(() => []),
        mkdirSync: jest.fn(),
    };
});

// Independent of the local config/settings.json (port range, UI port)
jest.mock('@/server/lib/settings', () => ({ getSettings: () => null, getUiPort: () => 7001 }));

const fs = require('fs');

describe('/api/environments/create', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST', () => {
        it('should create a new environment with valid data', async () => {
            fs.existsSync.mockReturnValue(false);

            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test Environment', port: 3001 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.environment.name).toBe('Test Environment');
            expect(data.environment.port).toBe(3001);
            expect(data.environment.uuid).toBeDefined();
            expect(data.environment.filename).toBe('test-environment.json');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should reject request without name', async () => {
            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ port: 3001 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        it('should reject request with invalid name type', async () => {
            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 123, port: 3001 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Name is required');
        });

        it('should reject request without port', async () => {
            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test' }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Valid port number is required (1-65535)');
        });

        it('should reject request with port out of range (too low)', async () => {
            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test', port: 0 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Valid port number is required (1-65535)');
        });

        it('should reject request with port out of range (too high)', async () => {
            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test', port: 65536 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Valid port number is required (1-65535)');
        });

        it('should reject duplicate environment name', async () => {
            fs.existsSync.mockReturnValue(true);

            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Existing Environment', port: 3001 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(409);
            expect(data.error).toBe('Environment with this name already exists');
        });

        it('should generate correct filename from name', async () => {
            fs.existsSync.mockReturnValue(false);

            const testCases = [
                { name: 'My API', expected: 'my-api.json' },
                { name: 'Test_Environment', expected: 'test-environment.json' },
                { name: 'My   API   Test', expected: 'my-api-test.json' },
                { name: 'API!!!Test###', expected: 'api-test.json' },
            ];

            for (const { name, expected } of testCases) {
                const request = new Request('http://localhost/api/environments/create', {
                    method: 'POST',
                    body: JSON.stringify({ name, port: 3001 }),
                });

                const response = await POST(request);
                const data = await response.json();

                expect(data.environment.filename).toBe(expected);
            }
        });

        it('should create environment with correct default structure', async () => {
            fs.existsSync.mockReturnValue(false);

            const request = new Request('http://localhost/api/environments/create', {
                method: 'POST',
                body: JSON.stringify({ name: 'Test', port: 3001 }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(data.environment.lastMigration).toBe(33);
            expect(data.environment.endpointPrefix).toBe('');
            expect(data.environment.latency).toBe(0);
            expect(data.environment.hostname).toBe('');
            expect(data.environment.folders).toEqual([]);
            expect(data.environment.routes).toEqual([]);
            expect(data.environment.rootChildren).toEqual([]);
            expect(data.environment.data).toEqual([]);
            expect(data.environment.tlsOptions.enabled).toBe(false);
            expect(data.environment.headers).toEqual([]);
            expect(data.environment.proxyMode).toBe(false);
            expect(data.environment.callbacks).toEqual([]);
        });
    });

    describe('GET', () => {
        it('should list all environments', async () => {
            const mockFiles = ['env1.json', 'env2.json'];
            const mockEnv1 = {
                uuid: 'uuid-1',
                name: 'Environment 1',
                port: 3001,
                routes: [],
            };
            const mockEnv2 = {
                uuid: 'uuid-2',
                name: 'Environment 2',
                port: 3002,
                routes: [],
            };

            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(mockFiles);
            fs.readFileSync
                .mockReturnValueOnce(JSON.stringify(mockEnv1))
                .mockReturnValueOnce(JSON.stringify(mockEnv2));

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.environments).toHaveLength(2);
            expect(data.environments[0].filename).toBe('env1.json');
            expect(data.environments[1].filename).toBe('env2.json');
        });

        it('should create data directory if it does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.readdirSync.mockReturnValue([]);

            const response = await GET();
            const data = await response.json();

            expect(fs.mkdirSync).toHaveBeenCalled();
            expect(response.status).toBe(200);
            expect(data.environments).toEqual([]);
        });

        it('should filter only JSON files', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['env1.json', 'env2.json', 'readme.md', 'data.txt']);
            fs.readFileSync.mockReturnValue(JSON.stringify({ name: 'Test' }));

            const response = await GET();
            const data = await response.json();

            expect(data.environments).toHaveLength(2);
        });
    });
});