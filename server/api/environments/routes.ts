import fs from 'fs';
import { Environment, Route, Response as RouteResponse } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';
import { resolveEnvFile } from '../../lib/data-dir';

export async function POST(req: Request) {
    try {
        const { filename, action, routeUuid, routeType, parentFolderUuid } = await req.json();

        if (!filename) {
            return Response.json({ error: 'Missing required field: filename' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        if (action === 'create') {
            const type = routeType || 'http';

            // Helper to create a response
            const createResponse = (method: string, statusCode: number = 200, label: string = '', isDefault: boolean = false): RouteResponse => ({
                uuid: uuidv4(),
                body: '{}',
                latency: 0,
                statusCode,
                label,
                headers: [],
                bodyType: 'INLINE',
                filePath: '',
                databucketID: '',
                sendFileAsBody: false,
                rules: [],
                rulesOperator: 'OR',
                disableTemplating: false,
                fallbackTo404: false,
                default: isDefault,
                crudKey: 'id',
                callbacks: []
            });

            let newRoute: Route;

            if (type === 'crud') {
                // CRUD route - includes responses for all CRUD operations
                newRoute = {
                    uuid: uuidv4(),
                    type: 'crud',
                    documentation: '',
                    method: '',
                    endpoint: 'new-crud',
                    responses: [
                        createResponse('get', 200, 'List (GET)', true),
                        createResponse('post', 201, 'Create (POST)'),
                        createResponse('get', 200, 'Read (GET)'),
                        createResponse('put', 200, 'Update (PUT)'),
                        createResponse('patch', 200, 'Patch (PATCH)'),
                        createResponse('delete', 204, 'Delete (DELETE)')
                    ],
                    responseMode: null,
                    streamingMode: null,
                    streamingInterval: 100
                };
            } else if (type === 'ws') {
                // WebSocket route
                newRoute = {
                    uuid: uuidv4(),
                    type: 'ws',
                    documentation: '',
                    method: 'get',
                    endpoint: 'websocket',
                    responses: [
                        createResponse('get', 101, 'Upgrade')
                    ],
                    responseMode: null,
                    streamingMode: 'UNICAST',
                    streamingInterval: 100
                };
            } else {
                // Standard HTTP route
                newRoute = {
                    uuid: uuidv4(),
                    type: 'http',
                    documentation: '',
                    method: 'get',
                    endpoint: 'new-route',
                    responses: [
                        createResponse('get', 200, '', true)
                    ],
                    responseMode: null,
                    streamingMode: null,
                    streamingInterval: 100
                };
            }

            environment.routes.push(newRoute);

            // Add to hierarchy (root or folder)
            const childRef = { type: 'route' as const, uuid: newRoute.uuid };
            if (parentFolderUuid) {
                const parent = environment.folders.find(f => f.uuid === parentFolderUuid);
                if (parent) {
                    parent.children.push(childRef);
                } else {
                    environment.rootChildren.push(childRef);
                }
            } else {
                environment.rootChildren.push(childRef);
            }

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true, route: newRoute });
        }

        if (action === 'delete') {
            if (!routeUuid) return Response.json({ error: 'Missing routeUuid' }, { status: 400 });

            environment.routes = environment.routes.filter(r => r.uuid !== routeUuid);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        if (action === 'duplicate') {
            if (!routeUuid) return Response.json({ error: 'Missing routeUuid' }, { status: 400 });

            const source = environment.routes.find(r => r.uuid === routeUuid);
            if (!source) return Response.json({ error: 'Source route not found' }, { status: 404 });

            const clone: Route = JSON.parse(JSON.stringify(source));
            clone.uuid = uuidv4();
            clone.endpoint = `${clone.endpoint}-copy`;
            clone.responses.forEach(res => {
                res.uuid = uuidv4();
            });

            environment.routes.push(clone);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true, route: clone });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing routes:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
