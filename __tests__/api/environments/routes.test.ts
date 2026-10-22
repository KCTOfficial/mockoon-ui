/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/server/api/environments/routes';

// Mock fs module
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
    };
});

const fs = require('fs');

// Sample environment for testing
const sampleEnvironment = {
    uuid: 'env-uuid',
    lastMigration: 33,
    name: 'Test Environment',
    endpointPrefix: '',
    latency: 0,
    port: 3000,
    hostname: '',
    folders: [],
    routes: [
        {
            uuid: 'route-1',
            type: 'http',
            documentation: 'Test route',
            method: 'get',
            endpoint: '/test',
            responses: [
                {
                    uuid: 'resp-1',
                    body: '{}',
                    latency: 0,
                    statusCode: 200,
                    label: 'Success',
                    headers: [],
                    bodyType: 'INLINE',
                    filePath: '',
                    databucketID: '',
                    sendFileAsBody: false,
                    rules: [],
                    rulesOperator: 'OR',
                    disableTemplating: false,
                    fallbackTo404: false,
                    default: true,
                    crudKey: 'id',
                    callbacks: [],
                },
            ],
            responseMode: null,
            streamingMode: null,
            streamingInterval: 100,
        },
    ],
    rootChildren: [{ type: 'route', uuid: 'route-1' }],
    data: [],
    environments: [],
    proxies: [],
    callbacks: [],
};

describe('/api/environments/routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST - create route', () => {
        it('should create a new HTTP route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'create',
                    routeType: 'http',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.route.type).toBe('http');
            expect(data.route.method).toBe('get');
            expect(data.route.endpoint).toBe('new-route');
            expect(data.route.responses).toHaveLength(1);
            expect(data.route.responses[0].statusCode).toBe(200);
        });

        it('should create a new CRUD route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'create',
                    routeType: 'crud',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.route.type).toBe('crud');
            expect(data.route.endpoint).toBe('new-crud');
            expect(data.route.responses).toHaveLength(6); // GET, POST, GET, PUT, PATCH, DELETE
        });

        it('should create a new WebSocket route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'create',
                    routeType: 'ws',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.route.type).toBe('ws');
            expect(data.route.method).toBe('get');
            expect(data.route.endpoint).toBe('websocket');
            expect(data.route.streamingMode).toBe('UNICAST');
        });

        it('should reject request without filename', async () => {
            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({ action: 'create' }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Missing required field: filename');
        });

        it('should return 404 for non-existent file', async () => {
            fs.existsSync.mockReturnValue(false);

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'nonexistent.json',
                    action: 'create',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('File not found');
        });

        it('should add route to rootChildren', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'create',
                    routeType: 'http',
                }),
            });

            await POST(request);

            const writeCall = fs.writeFileSync.mock.calls[0];
            const savedEnv = JSON.parse(writeCall[1]);

            expect(savedEnv.rootChildren).toHaveLength(2);
            expect(savedEnv.rootChildren[1].type).toBe('route');
        });
    });

    describe('POST - update route', () => {
        it('should update an existing route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'update',
                    routeUuid: 'route-1',
                    route: {
                        ...sampleEnvironment.routes[0],
                        endpoint: '/updated-endpoint',
                        method: 'post',
                    },
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.route.endpoint).toBe('/updated-endpoint');
            expect(data.route.method).toBe('post');
        });

        it('should return 404 for non-existent route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'update',
                    routeUuid: 'non-existent-route',
                    route: { endpoint: '/test' },
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Route not found');
        });
    });

    describe('POST - delete route', () => {
        it('should delete an existing route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'delete',
                    routeUuid: 'route-1',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);

            const writeCall = fs.writeFileSync.mock.calls[0];
            const savedEnv = JSON.parse(writeCall[1]);
            expect(savedEnv.routes).toHaveLength(0);
            expect(savedEnv.rootChildren).toHaveLength(0);
        });

        it('should return 404 when deleting non-existent route', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'POST',
                body: JSON.stringify({
                    filename: 'test.json',
                    action: 'delete',
                    routeUuid: 'non-existent-route',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Route not found');
        });
    });

    describe('DELETE', () => {
        it('should delete a route via DELETE method', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(sampleEnvironment));

            const request = new Request('http://localhost/api/environments/routes', {
                method: 'DELETE',
                body: JSON.stringify({
                    filename: 'test.json',
                    routeUuid: 'route-1',
                }),
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });
});