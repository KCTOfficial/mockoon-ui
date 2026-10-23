import fs from 'fs';
import path from 'path';
import { v4 as generateUUID } from 'uuid';
import { normalizeEnvironment } from '../../lib/normalize-env';
import { portForImport } from '../../lib/port-range';

const DATA_DIR = path.join(process.cwd(), 'data');

interface MockoonEnvironment {
    uuid: string;
    lastMigration: number;
    name: string;
    endpointPrefix: string;
    latency: number;
    port: number;
    hostname: string;
    folders: any[];
    routes: any[];
    rootChildren: any[];
    data: any[];
    environments: any[];
    proxies: any[];
    callbacks: any[];
}

// Required fields for a valid Mockoon environment (as exported by Mockoon itself)
const REQUIRED_FIELDS = [
    'uuid', 'lastMigration', 'name', 'port', 'endpointPrefix',
    'latency', 'hostname', 'folders', 'routes', 'rootChildren',
    'data', 'callbacks'
];

function isValidMockoonEnvironment(obj: any): obj is MockoonEnvironment {
    if (typeof obj !== 'object' || obj === null) return false;

    // Check for required fields
    for (const field of REQUIRED_FIELDS) {
        if (!(field in obj)) {
            return false;
        }
    }

    // Validate types
    if (typeof obj.name !== 'string' || obj.name.trim() === '') return false;
    if (typeof obj.port !== 'number' || obj.port < 1 || obj.port > 65535) return false;
    if (!Array.isArray(obj.routes)) return false;
    if (!Array.isArray(obj.folders)) return false;

    return true;
}

function sanitizeEnvironment(env: any): MockoonEnvironment {
    // Generate new UUID to avoid conflicts
    const newUUID = generateUUID();

    // Ensure all required fields exist with defaults; keep everything else (tlsOptions, cors, headers, ...)
    return {
        ...env,
        uuid: newUUID,
        lastMigration: env.lastMigration || 33,
        name: env.name || 'Imported Environment',
        endpointPrefix: env.endpointPrefix || '',
        latency: typeof env.latency === 'number' ? env.latency : 0,
        port: typeof env.port === 'number' ? env.port : 3000,
        hostname: env.hostname || '',
        folders: Array.isArray(env.folders) ? env.folders : [],
        routes: Array.isArray(env.routes) ? env.routes : [],
        rootChildren: Array.isArray(env.rootChildren) ? env.rootChildren : [],
        data: Array.isArray(env.data) ? env.data : [],
        environments: Array.isArray(env.environments) ? env.environments : [],
        proxies: Array.isArray(env.proxies) ? env.proxies : [],
        callbacks: Array.isArray(env.callbacks) ? env.callbacks : []
    };
}

function generateUniqueFilename(name: string): string {
    // Convert name to lowercase, replace spaces and special chars with hyphens
    const baseName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    let filename = `${baseName}.json`;
    let counter = 1;

    // Check if file already exists, append number if needed
    while (fs.existsSync(path.join(DATA_DIR, filename))) {
        filename = `${baseName}-${counter}.json`;
        counter++;
    }

    return filename;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return Response.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Check file extension
        if (!file.name.endsWith('.json')) {
            return Response.json(
                { error: 'File must be a JSON file' },
                { status: 400 }
            );
        }

        // Read and parse file content
        const content = await file.text();
        let parsedContent: any;

        try {
            parsedContent = JSON.parse(content);
        } catch (e) {
            return Response.json(
                { error: 'Invalid JSON format' },
                { status: 400 }
            );
        }

        // Validate Mockoon environment structure
        if (!isValidMockoonEnvironment(parsedContent)) {
            // Try to sanitize and import anyway if it has basic structure
            if (parsedContent.name && parsedContent.port) {
                parsedContent = sanitizeEnvironment(parsedContent);
            } else {
                return Response.json(
                    { error: 'Invalid Mockoon environment structure. Required fields: name, port' },
                    { status: 400 }
                );
            }
        } else {
            // Generate new UUID to avoid conflicts
            parsedContent = {
                ...parsedContent,
                uuid: generateUUID()
            };
        }

        // Migrate and fill missing fields so the file can be served by Mockoon
        let environment;
        try {
            environment = normalizeEnvironment(parsedContent);
        } catch (e) {
            return Response.json(
                { error: e instanceof Error ? e.message : 'Invalid Mockoon environment' },
                { status: 400 }
            );
        }

        // Keep the file's port only if it is in the allowed range and free
        const port = portForImport(environment.port);
        if (port === null) {
            return Response.json(
                { error: 'No free port left in the allowed range' },
                { status: 409 }
            );
        }
        environment.port = port;

        // Generate unique filename
        const filename = generateUniqueFilename(environment.name);
        const filePath = path.join(DATA_DIR, filename);

        // Write the file
        fs.writeFileSync(filePath, JSON.stringify(environment, null, 2));

        // Return the full environment: the UI adds it to its state as-is
        return Response.json({
            success: true,
            environment: { ...environment, filename }
        });

    } catch (error) {
        console.error('Error importing environment:', error);
        return Response.json(
            { error: 'Failed to import environment' },
            { status: 500 }
        );
    }
}
