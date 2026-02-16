import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment, Route, Response } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const { filename, action, routeUuid, routeType, parentFolderUuid } = await req.json();

        if (!filename) {
            return NextResponse.json({ error: 'Missing required field: filename' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        if (action === 'create') {
            const type = routeType || 'http';

            // Helper to create a response
            const createResponse = (method: string, statusCode: number = 200, label: string = '', isDefault: boolean = false): Response => ({
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
            return NextResponse.json({ success: true, route: newRoute });
        }

        if (action === 'delete') {
            if (!routeUuid) return NextResponse.json({ error: 'Missing routeUuid' }, { status: 400 });

            environment.routes = environment.routes.filter(r => r.uuid !== routeUuid);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        if (action === 'duplicate') {
            if (!routeUuid) return NextResponse.json({ error: 'Missing routeUuid' }, { status: 400 });

            const source = environment.routes.find(r => r.uuid === routeUuid);
            if (!source) return NextResponse.json({ error: 'Source route not found' }, { status: 404 });

            const clone: Route = JSON.parse(JSON.stringify(source));
            clone.uuid = uuidv4();
            clone.endpoint = `${clone.endpoint}-copy`;
            clone.responses.forEach(res => {
                res.uuid = uuidv4();
            });

            environment.routes.push(clone);
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true, route: clone });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing routes:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
