import fs from 'fs';
import { Environment } from '@/types/mockoon';
import { resolveEnvFile } from '../../lib/data-dir';

export async function POST(req: Request) {
    try {
        const { filename, routeUuid, updatedRoute } = await req.json();

        if (!filename || !routeUuid || !updatedRoute) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        // Find the route to update
        const routeId = environment.routes.findIndex(r => r.uuid === routeUuid);
        if (routeId === -1) {
            return Response.json({ error: 'Route not found' }, { status: 404 });
        }

        // Update the route
        environment.routes[routeId] = {
            ...environment.routes[routeId],
            ...updatedRoute
        };

        // Write back to file
        fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');

        return Response.json({ success: true, message: 'Route updated successfully' });
    } catch (error: any) {
        console.error('API Error updating route:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
