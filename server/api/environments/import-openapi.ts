import fs from 'fs';
import path from 'path';
import { convertFromOpenAPI, isValidOpenAPISpec } from '@/lib/openapi-converter';
import { normalizeEnvironment } from '../../lib/normalize-env';

const DATA_DIR = path.join(process.cwd(), 'data');

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
        const portOverride = formData.get('port') as string | null;

        if (!file) {
            return Response.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Check file extension
        const validExtensions = ['.json', '.yaml', '.yml'];
        const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

        if (!validExtensions.includes(fileExtension)) {
            return Response.json(
                { error: 'File must be a JSON or YAML file (.json, .yaml, .yml)' },
                { status: 400 }
            );
        }

        // Read and parse file content
        const content = await file.text();

        // Validate OpenAPI spec
        const validation = isValidOpenAPISpec(content);
        if (!validation.valid) {
            return Response.json(
                { error: validation.error || 'Invalid OpenAPI specification' },
                { status: 400 }
            );
        }

        // Convert to Mockoon environment
        const port = portOverride ? parseInt(portOverride, 10) : undefined;
        // Normalize to fill Mockoon defaults (tlsOptions, cors, headers, ...) required to start the server
        const environment = normalizeEnvironment(convertFromOpenAPI(content, port));

        // Generate unique filename
        const filename = generateUniqueFilename(environment.name);
        const filePath = path.join(DATA_DIR, filename);

        // Write the file
        fs.writeFileSync(filePath, JSON.stringify(environment, null, 2));

        return Response.json({
            success: true,
            version: validation.version,
            routeCount: environment.routes.length,
            environment: {
                ...environment,
                filename: filename
            }
        });

    } catch (error) {
        console.error('Error importing OpenAPI spec:', error);

        if (error instanceof Error) {
            return Response.json(
                { error: error.message },
                { status: 400 }
            );
        }

        return Response.json(
            { error: 'Failed to import OpenAPI specification' },
            { status: 500 }
        );
    }
}
