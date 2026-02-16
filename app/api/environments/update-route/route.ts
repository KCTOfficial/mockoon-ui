import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment } from '@/types/mockoon';

export async function POST(req: NextRequest) {
    try {
        const { filename, routeUuid, updatedRoute } = await req.json();

        if (!filename || !routeUuid || !updatedRoute) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        // Find the route to update
        const routeId = environment.routes.findIndex(r => r.uuid === routeUuid);
        if (routeId === -1) {
            return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        }

        // Update the route
        environment.routes[routeId] = {
            ...environment.routes[routeId],
            ...updatedRoute
        };

        // Write back to file
        fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');

        return NextResponse.json({ success: true, message: 'Route updated successfully' });
    } catch (error: any) {
        console.error('API Error updating route:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
