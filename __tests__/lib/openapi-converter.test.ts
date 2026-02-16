import {
    convertFromOpenAPI,
    isValidOpenAPISpec,
} from '@/lib/openapi-converter';

// Sample OpenAPI v3 spec
const openApiV3Spec = {
    openapi: '3.0.0',
    info: {
        title: 'Sample API',
        version: '1.0.0',
        description: 'A sample API for testing',
    },
    servers: [
        {
            url: 'https://api.example.com/v1',
        },
    ],
    paths: {
        '/users': {
            get: {
                summary: 'Get all users',
                description: 'Returns a list of users',
                operationId: 'getUsers',
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'integer' },
                                            name: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            post: {
                summary: 'Create a user',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    email: { type: 'string' },
                                },
                                required: ['name', 'email'],
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'User created',
                    },
                },
            },
        },
        '/users/{id}': {
            get: {
                summary: 'Get user by ID',
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: { type: 'integer' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'User found',
                        content: {
                            'application/json': {
                                example: { id: 1, name: 'John Doe' },
                            },
                        },
                    },
                    '404': {
                        description: 'User not found',
                    },
                },
            },
            put: {
                summary: 'Update user',
                responses: {
                    '200': {
                        description: 'User updated',
                    },
                },
            },
            delete: {
                summary: 'Delete user',
                responses: {
                    '204': {
                        description: 'User deleted',
                    },
                },
            },
        },
    },
};

// Sample Swagger v2 spec
const swaggerV2Spec = {
    swagger: '2.0',
    info: {
        title: 'Swagger Petstore',
        version: '1.0.0',
    },
    host: 'petstore.swagger.io:8080',
    basePath: '/api',
    paths: {
        '/pets': {
            get: {
                summary: 'List all pets',
                responses: {
                    '200': {
                        description: 'List of pets',
                        schema: {
                            type: 'array',
                            items: {
                                $ref: '#/definitions/Pet',
                            },
                        },
                    },
                },
            },
        },
    },
    definitions: {
        Pet: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
            },
        },
    },
};

// OpenAPI v3 with server variables
const openApiV3WithVariables = {
    openapi: '3.0.0',
    info: {
        title: 'API with Variables',
        version: '1.0.0',
    },
    servers: [
        {
            url: 'https://{environment}.example.com:{port}/v2',
            variables: {
                environment: {
                    default: 'api',
                },
                port: {
                    default: '443',
                },
            },
        },
    ],
    paths: {
        '/test': {
            get: {
                responses: {
                    '200': {
                        description: 'Test response',
                    },
                },
            },
        },
    },
};

// OpenAPI v3 with examples
const openApiV3WithExamples = {
    openapi: '3.0.0',
    info: {
        title: 'API with Examples',
        version: '1.0.0',
    },
    paths: {
        '/products': {
            get: {
                responses: {
                    '200': {
                        description: 'List of products',
                        content: {
                            'application/json': {
                                examples: {
                                    example1: {
                                        summary: 'Sample products',
                                        value: [
                                            { id: 1, name: 'Product 1' },
                                            { id: 2, name: 'Product 2' },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

// OpenAPI v3 with allOf, oneOf, anyOf
const openApiV3WithComplexSchemas = {
    openapi: '3.0.0',
    info: {
        title: 'Complex Schemas API',
        version: '1.0.0',
    },
    paths: {
        '/complex': {
            post: {
                responses: {
                    '200': {
                        description: 'Complex response',
                        content: {
                            'application/json': {
                                schema: {
                                    allOf: [
                                        {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'integer' },
                                            },
                                        },
                                        {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },
        '/oneof': {
            post: {
                responses: {
                    '200': {
                        description: 'OneOf response',
                        content: {
                            'application/json': {
                                schema: {
                                    oneOf: [
                                        { type: 'string' },
                                        { type: 'integer' },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

// OpenAPI v3 with components/schemas
const openApiV3WithComponents = {
    openapi: '3.0.0',
    info: {
        title: 'API with Components',
        version: '1.0.0',
    },
    paths: {
        '/items': {
            get: {
                responses: {
                    '200': {
                        description: 'List of items',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/ItemList',
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Item: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                },
            },
            ItemList: {
                type: 'array',
                items: {
                    $ref: '#/components/schemas/Item',
                },
            },
        },
    },
};

// Invalid spec
const invalidSpec = {
    info: {
        title: 'Invalid API',
        version: '1.0.0',
    },
    paths: {},
};

describe('openapi-converter', () => {
    describe('isValidOpenAPISpec', () => {
        describe('valid specifications', () => {
            it('should validate OpenAPI v3 spec in JSON format', () => {
                const result = isValidOpenAPISpec(JSON.stringify(openApiV3Spec));
                expect(result.valid).toBe(true);
                expect(result.version).toBe('OpenAPI 3.0.0');
                expect(result.error).toBeUndefined();
            });

            it('should validate Swagger v2 spec in JSON format', () => {
                const result = isValidOpenAPISpec(JSON.stringify(swaggerV2Spec));
                expect(result.valid).toBe(true);
                expect(result.version).toBe('Swagger 2.0');
                expect(result.error).toBeUndefined();
            });

            it('should validate OpenAPI v3 spec in YAML format', () => {
                const yamlSpec = `
openapi: '3.0.0'
info:
  title: YAML API
  version: '1.0.0'
paths:
  /test:
    get:
      responses:
        '200':
          description: Test
`;
                const result = isValidOpenAPISpec(yamlSpec);
                expect(result.valid).toBe(true);
                expect(result.version).toBe('OpenAPI 3.0.0');
            });

            it('should validate Swagger v2 spec in YAML format', () => {
                const yamlSpec = `
swagger: '2.0'
info:
  title: YAML Swagger
  version: '1.0.0'
paths:
  /test:
    get:
      responses:
        '200':
          description: Test
`;
                const result = isValidOpenAPISpec(yamlSpec);
                expect(result.valid).toBe(true);
                expect(result.version).toBe('Swagger 2.0');
            });
        });

        describe('invalid specifications', () => {
            it('should reject invalid JSON', () => {
                const result = isValidOpenAPISpec('{ invalid json }');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Failed to parse');
            });

            it('should reject invalid YAML', () => {
                const result = isValidOpenAPISpec('invalid: yaml: : :');
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Failed to parse');
            });

            it('should reject spec without openapi or swagger version', () => {
                const result = isValidOpenAPISpec(JSON.stringify(invalidSpec));
                expect(result.valid).toBe(false);
                expect(result.error).toContain('Not a valid Swagger/OpenAPI specification');
            });

            it('should reject OpenAPI spec with wrong version', () => {
                const spec = { openapi: '4.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} };
                const result = isValidOpenAPISpec(JSON.stringify(spec));
                expect(result.valid).toBe(false);
            });

            it('should reject Swagger spec with wrong version', () => {
                const spec = { swagger: '3.0', info: { title: 'Test', version: '1.0.0' }, paths: {} };
                const result = isValidOpenAPISpec(JSON.stringify(spec));
                expect(result.valid).toBe(false);
            });
        });
    });

    describe('convertFromOpenAPI', () => {
        describe('OpenAPI v3 conversion', () => {
            it('should convert basic OpenAPI v3 spec to Mockoon environment', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));

                expect(result).toBeDefined();
                expect(result.name).toBe('Sample API');
                expect(result.uuid).toBeDefined();
                expect(result.lastMigration).toBe(33);
                expect(result.routes).toHaveLength(5); // GET /users, POST /users, GET /users/{id}, PUT /users/{id}, DELETE /users/{id}
            });

            it('should extract endpoint prefix from server URL', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                expect(result.endpointPrefix).toBe('v1');
            });

            it('should extract port from server URL', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                expect(result.port).toBe(443); // HTTPS default port
            });

            it('should use custom port when provided', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec), 3001);
                expect(result.port).toBe(3001);
            });

            it('should convert HTTP methods correctly', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const methods = result.routes.map(r => r.method);
                expect(methods).toContain('GET');
                expect(methods).toContain('POST');
                expect(methods).toContain('PUT');
                expect(methods).toContain('DELETE');
            });

            it('should convert paths to endpoints', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const endpoints = result.routes.map(r => r.endpoint);
                expect(endpoints).toContain('/users');
                expect(endpoints).toContain('/users/{id}');
            });

            it('should convert operation summary to documentation', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const getUsersRoute = result.routes.find(r => r.endpoint === '/users' && r.method === 'GET');
                expect(getUsersRoute?.documentation).toBe('Get all users');
            });

            it('should create responses with correct status codes', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const getUsersRoute = result.routes.find(r => r.endpoint === '/users' && r.method === 'GET');
                expect(getUsersRoute?.responses).toHaveLength(1);
                expect(getUsersRoute?.responses[0].statusCode).toBe(200);
            });

            it('should generate sample body from schema', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const getUsersRoute = result.routes.find(r => r.endpoint === '/users' && r.method === 'GET');
                const body = JSON.parse(getUsersRoute?.responses[0].body || '{}');
                expect(Array.isArray(body)).toBe(true);
            });

            it('should use example when provided', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const getUserRoute = result.routes.find(r => r.endpoint === '/users/{id}' && r.method === 'GET');
                const body = JSON.parse(getUserRoute?.responses[0].body || '{}');
                expect(body).toEqual({ id: 1, name: 'John Doe' });
            });

            it('should add CORS headers to responses', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                const route = result.routes[0];
                const headers = route.responses[0].headers;
                const headerKeys = headers.map(h => h.key);
                expect(headerKeys).toContain('Content-Type');
                expect(headerKeys).toContain('Access-Control-Allow-Origin');
                expect(headerKeys).toContain('Access-Control-Allow-Methods');
                expect(headerKeys).toContain('Access-Control-Allow-Headers');
            });

            it('should create rootChildren with route references', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3Spec));
                expect(result.rootChildren).toHaveLength(result.routes.length);
                result.rootChildren.forEach((child, index) => {
                    expect(child.type).toBe('route');
                    expect(child.uuid).toBe(result.routes[index].uuid);
                });
            });
        });

        describe('OpenAPI v3 with server variables', () => {
            it('should replace server variables with defaults', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3WithVariables));
                expect(result.endpointPrefix).toBe('v2');
                expect(result.port).toBe(443);
            });
        });

        describe('OpenAPI v3 with examples', () => {
            it('should use first example from examples object', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3WithExamples));
                const route = result.routes[0];
                const body = JSON.parse(route.responses[0].body);
                expect(Array.isArray(body)).toBe(true);
                expect(body).toHaveLength(2);
            });
        });

        describe('OpenAPI v3 with complex schemas', () => {
            it('should handle allOf schemas', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3WithComplexSchemas));
                const route = result.routes.find(r => r.endpoint === '/complex');
                const body = JSON.parse(route?.responses[0].body || '{}');
                expect(body).toHaveProperty('id');
                expect(body).toHaveProperty('name');
            });

            it('should handle oneOf schemas (use first option)', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3WithComplexSchemas));
                const route = result.routes.find(r => r.endpoint === '/oneof');
                const body = route?.responses[0].body;
                // First option is string
                expect(body).toBe('""');
            });
        });

        describe('OpenAPI v3 with components', () => {
            it('should resolve $ref to components/schemas', () => {
                const result = convertFromOpenAPI(JSON.stringify(openApiV3WithComponents));
                const route = result.routes[0];
                const body = JSON.parse(route.responses[0].body);
                expect(Array.isArray(body)).toBe(true);
                expect(body[0]).toHaveProperty('id');
                expect(body[0]).toHaveProperty('name');
            });
        });

        describe('Swagger v2 conversion', () => {
            it('should convert basic Swagger v2 spec to Mockoon environment', () => {
                const result = convertFromOpenAPI(JSON.stringify(swaggerV2Spec));

                expect(result).toBeDefined();
                expect(result.name).toBe('Swagger Petstore');
                expect(result.routes).toHaveLength(1);
            });

            it('should extract port from host field', () => {
                const result = convertFromOpenAPI(JSON.stringify(swaggerV2Spec));
                expect(result.port).toBe(8080);
            });

            it('should extract endpoint prefix from basePath', () => {
                const result = convertFromOpenAPI(JSON.stringify(swaggerV2Spec));
                expect(result.endpointPrefix).toBe('api');
            });

            it('should resolve $ref to definitions', () => {
                const result = convertFromOpenAPI(JSON.stringify(swaggerV2Spec));
                const route = result.routes[0];
                const body = JSON.parse(route.responses[0].body);
                expect(Array.isArray(body)).toBe(true);
                expect(body[0]).toHaveProperty('id');
                expect(body[0]).toHaveProperty('name');
            });
        });

        describe('error handling', () => {
            it('should throw error for invalid spec', () => {
                expect(() => convertFromOpenAPI(JSON.stringify(invalidSpec))).toThrow(
                    'Not a valid Swagger/OpenAPI specification. Must be v2.0 or v3.x'
                );
            });

            it('should throw error for invalid JSON', () => {
                expect(() => convertFromOpenAPI('{ invalid }')).toThrow();
            });
        });

        describe('edge cases', () => {
            it('should handle empty paths', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Empty API', version: '1.0.0' },
                    paths: {},
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes).toHaveLength(0);
                expect(result.rootChildren).toHaveLength(0);
            });

            it('should handle operations without responses', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'No Responses', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: {
                                summary: 'No response defined',
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes).toHaveLength(1);
                expect(result.routes[0].responses).toHaveLength(1);
                expect(result.routes[0].responses[0].statusCode).toBe(200);
                expect(result.routes[0].responses[0].label).toBe('Default response');
            });

            it('should skip status code ranges (e.g., 2XX)', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Status Ranges', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: {
                                responses: {
                                    '2XX': {
                                        description: 'Success range',
                                    },
                                    '200': {
                                        description: 'Specific success',
                                    },
                                },
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes[0].responses).toHaveLength(1);
                expect(result.routes[0].responses[0].statusCode).toBe(200);
            });

            it('should handle relative server URL', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Relative Server', version: '1.0.0' },
                    servers: [{ url: '/api/v1' }],
                    paths: {
                        '/test': {
                            get: { responses: { '200': { description: 'OK' } } },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.endpointPrefix).toBe('api/v1');
            });

            it('should handle missing server configuration', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'No Server', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: { responses: { '200': { description: 'OK' } } },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.endpointPrefix).toBe('');
                expect(result.port).toBe(3000);
            });

            it('should handle all HTTP methods', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'All Methods', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: { responses: { '200': { description: 'GET' } } },
                            post: { responses: { '201': { description: 'POST' } } },
                            put: { responses: { '200': { description: 'PUT' } } },
                            patch: { responses: { '200': { description: 'PATCH' } } },
                            delete: { responses: { '204': { description: 'DELETE' } } },
                            head: { responses: { '200': { description: 'HEAD' } } },
                            options: { responses: { '200': { description: 'OPTIONS' } } },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes).toHaveLength(7);
                const methods = result.routes.map(r => r.method);
                expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']));
            });

            it('should use description when summary is not available', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Description Only', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: {
                                description: 'Only description, no summary',
                                responses: { '200': { description: 'OK' } },
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes[0].documentation).toBe('Only description, no summary');
            });

            it('should handle schema with example property', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Schema Example', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: {
                                responses: {
                                    '200': {
                                        description: 'OK',
                                        content: {
                                            'application/json': {
                                                schema: {
                                                    type: 'string',
                                                    example: 'test-value',
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                expect(result.routes[0].responses[0].body).toBe('"test-value"');
            });

            it('should handle boolean schema type', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Boolean Type', version: '1.0.0' },
                    paths: {
                        '/test': {
                            get: {
                                responses: {
                                    '200': {
                                        description: 'OK',
                                        content: {
                                            'application/json': {
                                                schema: {
                                                    type: 'boolean',
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                const body = JSON.parse(result.routes[0].responses[0].body);
                expect(typeof body).toBe('boolean');
            });

            it('should handle number and integer schema types', () => {
                const spec = {
                    openapi: '3.0.0',
                    info: { title: 'Number Types', version: '1.0.0' },
                    paths: {
                        '/number': {
                            get: {
                                responses: {
                                    '200': {
                                        content: {
                                            'application/json': {
                                                schema: { type: 'number', example: 42.5 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        '/integer': {
                            get: {
                                responses: {
                                    '200': {
                                        content: {
                                            'application/json': {
                                                schema: { type: 'integer', example: 100 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                };
                const result = convertFromOpenAPI(JSON.stringify(spec));
                const numberBody = JSON.parse(result.routes.find(r => r.endpoint === '/number')?.responses[0].body || '{}');
                const integerBody = JSON.parse(result.routes.find(r => r.endpoint === '/integer')?.responses[0].body || '{}');
                expect(numberBody).toBe(42.5);
                expect(integerBody).toBe(100);
            });
        });
    });
});