import { parse as yamlParse } from 'yaml';
import { v4 as generateUUID } from 'uuid';

// Types for OpenAPI specifications
interface OpenAPIInfo {
    title?: string;
    version?: string;
    description?: string;
}

interface OpenAPIParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: OpenAPISchema;
}

interface OpenAPISchema {
    type?: string;
    properties?: Record<string, OpenAPISchema>;
    items?: OpenAPISchema;
    required?: string[];
    description?: string;
    example?: any;
    $ref?: string;
    allOf?: OpenAPISchema[];
    oneOf?: OpenAPISchema[];
    anyOf?: OpenAPISchema[];
}

interface OpenAPIResponse {
    description?: string;
    content?: Record<string, {
        schema?: OpenAPISchema;
        example?: any;
        examples?: Record<string, any>;
    }>;
    schema?: OpenAPISchema; // Swagger v2
    headers?: Record<string, { description?: string; schema?: OpenAPISchema }>;
}

interface OpenAPIOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: OpenAPIParameter[];
    requestBody?: {
        content?: Record<string, { schema?: OpenAPISchema; example?: any }>;
        description?: string;
        required?: boolean;
    };
    responses?: Record<string, OpenAPIResponse>;
    tags?: string[];
}

interface OpenAPIPath {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    patch?: OpenAPIOperation;
    head?: OpenAPIOperation;
    options?: OpenAPIOperation;
}

interface OpenAPISpec {
    openapi?: string; // v3
    swagger?: string; // v2
    info: OpenAPIInfo;
    host?: string; // v2
    basePath?: string; // v2
    servers?: { url: string; variables?: Record<string, { default?: string }> }[]; // v3
    paths: Record<string, OpenAPIPath>;
    components?: {
        schemas?: Record<string, OpenAPISchema>;
    };
    definitions?: Record<string, OpenAPISchema>; // v2
}

// Mockoon types
interface MockoonHeader {
    uuid: string;
    key: string;
    value: string;
}

interface MockoonRouteResponse {
    uuid: string;
    body: string;
    statusCode: number;
    label: string;
    headers: MockoonHeader[];
    rules: any[];
    rulesOperator: string;
    disableTemplating: boolean;
    fallbackTo404: boolean;
    bodyType: 'INLINE' | 'FILE' | 'BIN';
}

interface MockoonRoute {
    uuid: string;
    type: 'http' | 'crud';
    documentation: string;
    method: string;
    endpoint: string;
    responses: MockoonRouteResponse[];
    responseMode: null | 'RANDOM' | 'SEQUENTIAL' | 'DISABLE_RULES' | 'FALLBACK';
}

interface MockoonEnvironment {
    uuid: string;
    lastMigration: number;
    name: string;
    endpointPrefix: string;
    latency: number;
    port: number;
    hostname: string;
    folders: any[];
    routes: MockoonRoute[];
    rootChildren: { type: string; uuid: string }[];
    data: any[];
    environments: any[];
    proxies: any[];
    callbacks: any[];
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

/**
 * Parse JSON or YAML string
 */
function parseJsonOrYaml(content: string): any {
    const trimmed = content.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(content);
    }

    return yamlParse(content);
}

/**
 * Check if spec is Swagger v2
 */
function isSwagger(spec: any): spec is OpenAPISpec {
    return spec.swagger !== undefined && spec.swagger.startsWith('2.');
}

/**
 * Check if spec is OpenAPI v3
 */
function isOpenAPIV3(spec: any): spec is OpenAPISpec {
    return spec.openapi !== undefined && spec.openapi.startsWith('3.');
}

/**
 * Remove leading slash from path
 */
function removeLeadingSlash(path: string): string {
    return path.startsWith('/') ? path.slice(1) : path;
}

/**
 * Generate a sample body from OpenAPI schema
 */
function generateSampleBody(schema?: OpenAPISchema, definitions?: Record<string, OpenAPISchema>): any {
    if (!schema) return {};

    // Handle $ref
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        if (refName && definitions?.[refName]) {
            return generateSampleBody(definitions[refName], definitions);
        }
        return {};
    }

    // Handle allOf
    if (schema.allOf) {
        const merged: any = {};
        for (const subSchema of schema.allOf) {
            Object.assign(merged, generateSampleBody(subSchema, definitions));
        }
        return merged;
    }

    // Handle oneOf/anyOf - use first option
    if (schema.oneOf || schema.anyOf) {
        const options = schema.oneOf || schema.anyOf;
        if (options && options.length > 0) {
            return generateSampleBody(options[0], definitions);
        }
    }

    switch (schema.type) {
        case 'object':
            const obj: any = {};
            if (schema.properties) {
                for (const [key, prop] of Object.entries(schema.properties)) {
                    obj[key] = generateSampleBody(prop, definitions);
                }
            }
            return obj;
        case 'array':
            if (schema.items) {
                return [generateSampleBody(schema.items, definitions)];
            }
            return [];
        case 'string':
            return schema.example ?? '';
        case 'number':
        case 'integer':
            return schema.example ?? 0;
        case 'boolean':
            return schema.example ?? false;
        default:
            return {};
    }
}

/**
 * Convert OpenAPI spec to Mockoon environment
 */
export function convertFromOpenAPI(specContent: string, port?: number): MockoonEnvironment {
    const parsedSpec = parseJsonOrYaml(specContent);

    const isSwaggerSpec = isSwagger(parsedSpec);
    const isOpenAPI3Spec = isOpenAPIV3(parsedSpec);

    if (!isSwaggerSpec && !isOpenAPI3Spec) {
        throw new Error('Not a valid Swagger/OpenAPI specification. Must be v2.0 or v3.x');
    }

    const spec = parsedSpec as OpenAPISpec;

    const routes: MockoonRoute[] = [];
    let endpointPrefix = '';
    let defaultPort = 3000;

    // Extract base path and port
    if (isSwaggerSpec) {
        // Swagger v2
        if (spec.host) {
            const hostParts = spec.host.split(':');
            if (hostParts[1]) {
                defaultPort = parseInt(hostParts[1], 10);
            }
        }
        if (spec.basePath) {
            endpointPrefix = removeLeadingSlash(spec.basePath);
        }
    } else if (isOpenAPI3Spec) {
        // OpenAPI v3
        if (spec.servers && spec.servers[0]) {
            let serverUrl = spec.servers[0].url;

            // Replace variables in URL
            if (spec.servers[0].variables) {
                for (const [varName, varConfig] of Object.entries(spec.servers[0].variables)) {
                    serverUrl = serverUrl.replace(`{${varName}}`, varConfig.default || '');
                }
            }

            try {
                const url = new URL(serverUrl);
                defaultPort = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
                endpointPrefix = removeLeadingSlash(url.pathname);
            } catch {
                // URL parsing failed, might be relative path
                if (serverUrl.startsWith('/')) {
                    endpointPrefix = removeLeadingSlash(serverUrl);
                }
            }
        }
    }

    // Get definitions/schemas for $ref resolution
    const definitions = spec.components?.schemas || spec.definitions || {};

    // Convert paths to routes
    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) continue;

            const routeResponses: MockoonRouteResponse[] = [];

            // Convert responses
            if (operation.responses) {
                for (const [statusCode, response] of Object.entries(operation.responses)) {
                    const code = parseInt(statusCode, 10) || 200;

                    // Skip status code ranges like 2XX, 4XX
                    if (isNaN(code) || statusCode.includes('X')) continue;

                    let body = '';

                    // OpenAPI v3 - check content
                    if (response.content) {
                        const jsonContent = response.content['application/json'];
                        if (jsonContent) {
                            if (jsonContent.example) {
                                body = JSON.stringify(jsonContent.example, null, 2);
                            } else if (jsonContent.examples) {
                                // Use first example
                                const firstExample = Object.values(jsonContent.examples)[0];
                                if (firstExample) {
                                    body = JSON.stringify(firstExample, null, 2);
                                }
                            } else if (jsonContent.schema) {
                                const sampleBody = generateSampleBody(jsonContent.schema, definitions);
                                body = JSON.stringify(sampleBody, null, 2);
                            }
                        }
                    }
                    // Swagger v2 - check schema
                    else if (response.schema) {
                        const sampleBody = generateSampleBody(response.schema, definitions);
                        body = JSON.stringify(sampleBody, null, 2);
                    }

                    // Build headers
                    const headers: MockoonHeader[] = [
                        {
                            uuid: generateUUID(),
                            key: 'Content-Type',
                            value: 'application/json'
                        }
                    ];

                    // Add CORS headers
                    headers.push(
                        { uuid: generateUUID(), key: 'Access-Control-Allow-Origin', value: '*' },
                        { uuid: generateUUID(), key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' },
                        { uuid: generateUUID(), key: 'Access-Control-Allow-Headers', value: 'Content-Type, Origin, Accept, Authorization, Content-Length, X-Requested-With' }
                    );

                    routeResponses.push({
                        uuid: generateUUID(),
                        body,
                        statusCode: code,
                        label: response.description || `Response ${code}`,
                        headers,
                        rules: [],
                        rulesOperator: 'OR',
                        disableTemplating: false,
                        fallbackTo404: false,
                        bodyType: 'INLINE'
                    });
                }
            }

            // Ensure at least one response exists
            if (routeResponses.length === 0) {
                routeResponses.push({
                    uuid: generateUUID(),
                    body: '{}',
                    statusCode: 200,
                    label: 'Default response',
                    headers: [
                        { uuid: generateUUID(), key: 'Content-Type', value: 'application/json' },
                        { uuid: generateUUID(), key: 'Access-Control-Allow-Origin', value: '*' }
                    ],
                    rules: [],
                    rulesOperator: 'OR',
                    disableTemplating: false,
                    fallbackTo404: false,
                    bodyType: 'INLINE'
                });
            }

            // Build documentation
            const documentation = operation.summary || operation.description || '';

            routes.push({
                uuid: generateUUID(),
                type: 'http',
                documentation,
                method: method.toUpperCase(),
                endpoint: path,
                responses: routeResponses,
                responseMode: null
            });
        }
    }

    // Build environment
    const environment: MockoonEnvironment = {
        uuid: generateUUID(),
        lastMigration: 33,
        name: spec.info?.title || 'OpenAPI Import',
        endpointPrefix,
        latency: 0,
        port: port || defaultPort,
        hostname: '',
        folders: [],
        routes,
        rootChildren: routes.map(route => ({
            type: 'route',
            uuid: route.uuid
        })),
        data: [],
        environments: [],
        proxies: [],
        callbacks: []
    };

    return environment;
}

/**
 * Validate if content is valid OpenAPI spec
 */
export function isValidOpenAPISpec(content: string): { valid: boolean; error?: string; version?: string } {
    try {
        const spec = parseJsonOrYaml(content);

        if (isSwagger(spec)) {
            return { valid: true, version: `Swagger ${spec.swagger}` };
        }

        if (isOpenAPIV3(spec)) {
            return { valid: true, version: `OpenAPI ${spec.openapi}` };
        }

        return { valid: false, error: 'Not a valid Swagger/OpenAPI specification. Must be v2.0 or v3.x' };
    } catch (error: any) {
        return { valid: false, error: `Failed to parse: ${error.message}` };
    }
}
