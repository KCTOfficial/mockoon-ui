import fs from 'fs';
import { Environment, Response as RouteResponse } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';
import { resolveEnvFile } from '../../lib/data-dir';

export async function POST(req: Request) {
    try {
        const { filename, action, routeUuid, responseUuid, updatedResponse } = await req.json();

        if (!filename || !routeUuid) {
            return Response.json({ error: 'Missing required fields: filename, routeUuid' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        const route = environment.routes.find(r => r.uuid === routeUuid);
        if (!route) {
            return Response.json({ error: 'Route not found' }, { status: 404 });
        }

        if (action === 'create') {
            const newResponse: RouteResponse = {
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
            return Response.json({ success: true, response: newResponse });
        }

        if (action === 'update') {
            if (!responseUuid || !updatedResponse) return Response.json({ error: 'Missing responseUuid or updatedResponse' }, { status: 400 });

            const index = route.responses.findIndex(r => r.uuid === responseUuid);
            if (index === -1) return Response.json({ error: 'Response not found' }, { status: 404 });

            route.responses[index] = { ...route.responses[index], ...updatedResponse };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        if (action === 'delete') {
            if (!responseUuid) return Response.json({ error: 'Missing responseUuid' }, { status: 400 });
            if (route.responses.length <= 1 && route.type !== 'crud') {
                return Response.json({ error: 'Cannot delete the last response' }, { status: 400 });
            }

            route.responses = route.responses.filter(r => r.uuid !== responseUuid);

            // Ensure at least one response is default
            if (route.responses.length > 0 && !route.responses.some(r => r.default)) {
                route.responses[0].default = true;
            }

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        if (action === 'duplicate') {
            if (!responseUuid) return Response.json({ error: 'Missing responseUuid' }, { status: 400 });

            const source = route.responses.find(r => r.uuid === responseUuid);
            if (!source) return Response.json({ error: 'Source response not found' }, { status: 404 });

            const clone: RouteResponse = {
                ...JSON.parse(JSON.stringify(source)), // Deep clone
                uuid: uuidv4(),
                default: false,
                label: `${source.label} (Copy)`
            };

            route.responses.push(clone);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true, response: clone });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing responses:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
