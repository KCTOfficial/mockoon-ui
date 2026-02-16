import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment, Response } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const { filename, action, routeUuid, responseUuid, updatedResponse } = await req.json();

        if (!filename || !routeUuid) {
            return NextResponse.json({ error: 'Missing required fields: filename, routeUuid' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        const route = environment.routes.find(r => r.uuid === routeUuid);
        if (!route) {
            return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        }

        if (action === 'create') {
            const newResponse: Response = {
                uuid: uuidv4(),
                body: '{}',
                latency: 0,
                statusCode: 200,
                label: '',
                headers: [],
                bodyType: 'INLINE',
                filePath: '',
                databucketID: '',
                sendFileAsBody: false,
                rules: [],
                rulesOperator: 'OR',
                disableTemplating: false,
                fallbackTo404: false,
                default: route.responses.length === 0,
                crudKey: 'id',
                callbacks: []
            };
            route.responses.push(newResponse);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true, response: newResponse });
        }

        if (action === 'update') {
            if (!responseUuid || !updatedResponse) return NextResponse.json({ error: 'Missing responseUuid or updatedResponse' }, { status: 400 });

            const index = route.responses.findIndex(r => r.uuid === responseUuid);
            if (index === -1) return NextResponse.json({ error: 'Response not found' }, { status: 404 });

            route.responses[index] = { ...route.responses[index], ...updatedResponse };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        if (action === 'delete') {
            if (!responseUuid) return NextResponse.json({ error: 'Missing responseUuid' }, { status: 400 });
            if (route.responses.length <= 1 && route.type !== 'crud') {
                return NextResponse.json({ error: 'Cannot delete the last response' }, { status: 400 });
            }

            route.responses = route.responses.filter(r => r.uuid !== responseUuid);

            // Ensure at least one response is default
            if (route.responses.length > 0 && !route.responses.some(r => r.default)) {
                route.responses[0].default = true;
            }

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        if (action === 'duplicate') {
            if (!responseUuid) return NextResponse.json({ error: 'Missing responseUuid' }, { status: 400 });

            const source = route.responses.find(r => r.uuid === responseUuid);
            if (!source) return NextResponse.json({ error: 'Source response not found' }, { status: 404 });

            const clone: Response = {
                ...JSON.parse(JSON.stringify(source)), // Deep clone
                uuid: uuidv4(),
                default: false,
                label: `${source.label} (Copy)`
            };

            route.responses.push(clone);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true, response: clone });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing responses:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
