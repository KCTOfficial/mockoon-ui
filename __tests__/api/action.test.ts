/**
 * @jest-environment node
 */
import { POST, GET } from '@/server/api/action';

// Mock PM2
jest.mock('pm2', () => ({
    connect: jest.fn((cb) => cb(null)),
    start: jest.fn((opts, cb) => cb(null)),
    stop: jest.fn((name, cb) => cb(null)),
    delete: jest.fn((name, cb) => cb(null)),
    list: jest.fn((cb) => cb(null, [])),
    describe: jest.fn((name, cb) => cb(null, [])),
    disconnect: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        existsSync: jest.fn(() => true),
        readFileSync: jest.fn(() => JSON.stringify({
            uuid: 'test-uuid',
            name: 'Test Environment',
            port: 3000,
            routes: [],
        })),
    };
});

const pm2 = require('pm2');

describe('/api/action', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST - start server', () => {
        it('should start a server with valid parameters', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'start',
                    filename: 'test.json',
                    port: 3000,
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(pm2.connect).toHaveBeenCalled();
            expect(pm2.start).toHaveBeenCalled();
        });

        it('should reject request without action', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    port: 3000,
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing required field');
        });

        it('should reject request without filename for start action', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'start',
                    port: 3000,
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing required field');
        });

        it('should handle PM2 start errors', async () => {
            pm2.start.mockImplementation((opts, cb) => cb(new Error('PM2 start failed')));

            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'start',
                    filename: 'test.json',
                    port: 3000,
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to start');
        });
    });

    describe('POST - stop server', () => {
        it('should stop a running server', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'stop',
                    filename: 'test.json',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(pm2.stop).toHaveBeenCalled();
            expect(pm2.delete).toHaveBeenCalled();
        });

        it('should handle PM2 stop errors', async () => {
            pm2.stop.mockImplementation((name, cb) => cb(new Error('Process not found')));

            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'stop',
                    filename: 'test.json',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to stop');
        });
    });

    describe('POST - restart server', () => {
        it('should restart a running server', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'restart',
                    filename: 'test.json',
                    port: 3000,
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(pm2.stop).toHaveBeenCalled();
            expect(pm2.start).toHaveBeenCalled();
        });
    });

    describe('POST - invalid action', () => {
        it('should reject invalid action', async () => {
            const request = new Request('http://localhost/api/action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'invalid',
                    filename: 'test.json',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Invalid action');
        });
    });

    describe('GET - list processes', () => {
        it('should list all running processes', async () => {
            pm2.list.mockImplementation((cb) => cb(null, [
                { name: 'test-api', pm2_env: { status: 'online' } },
                { name: 'another-api', pm2_env: { status: 'stopped' } },
            ]));

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.processes).toHaveLength(2);
        });

        it('should handle PM2 list errors', async () => {
            pm2.list.mockImplementation((cb) => cb(new Error('PM2 error'), null));

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to list');
        });
    });
});