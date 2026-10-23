import fs from 'fs';
import path from 'path';
import { normalizeEnvironment } from '../../lib/normalize-env';
import { checkPort } from '../../lib/port-range';

// Generate a UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Create a new environment with default structure
function createNewEnvironment(name: string, port: number) {
    return {
        uuid: generateUUID(),
        lastMigration: 33,
        name: name,
        endpointPrefix: "",
        latency: 0,
        port: port,
        hostname: "",
        folders: [],
        routes: [],
        rootChildren: [],
        data: [],
        environments: [],
        proxies: [],
        callbacks: []
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, port } = body;

        if (!name || typeof name !== 'string') {
            return Response.json({ error: 'Name is required' }, { status: 400 });
        }

        const portError = checkPort(port);
        if (portError) {
            return Response.json({ error: portError }, { status: 400 });
        }

        // Create filename from name (lowercase, replace spaces with dashes)
        const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '.json';
        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        // Check if file already exists
        if (fs.existsSync(filePath)) {
            return Response.json({ error: 'Environment with this name already exists' }, { status: 409 });
        }

        // Create new environment
        // Normalize to fill Mockoon defaults (tlsOptions, cors, headers, ...) required to start the server
        const newEnv = normalizeEnvironment(createNewEnvironment(name, port));

        // Write to file
        fs.writeFileSync(filePath, JSON.stringify(newEnv, null, 2), 'utf-8');

        return Response.json({
            success: true,
            environment: { ...newEnv, filename },
            message: `Environment "${name}" created successfully`
        });
    } catch (error) {
        console.error('Error creating environment:', error);
        return Response.json({ error: 'Failed to create environment' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data');

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        const environments = files.map(file => {
            const filePath = path.join(dataDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const env = JSON.parse(content);
            return { ...env, filename: file };
        });

        return Response.json({ environments });
    } catch (error) {
        console.error('Error listing environments:', error);
        return Response.json({ error: 'Failed to list environments' }, { status: 500 });
    }
}
