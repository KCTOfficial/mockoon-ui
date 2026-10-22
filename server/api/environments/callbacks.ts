import fs from 'fs';
import { Environment, Callback } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';
import { resolveEnvFile } from '../../lib/data-dir';

// Helper to generate a short ID for callbacks (4 chars)
const generateShortId = () => Math.random().toString(36).substring(2, 6);

export async function POST(req: Request) {
    try {
        const { filename, action, callback, callbackUuid } = await req.json();

        if (!filename) {
            return Response.json({ error: 'Missing filename' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        if (action === 'create') {
            const newCallback: Callback = {
                uuid: uuidv4(),
                id: callback?.id || generateShortId(),
                name: callback?.name || 'New callback',
                documentation: callback?.documentation || '',
                method: callback?.method || 'post',
                uri: callback?.uri || '',
                headers: callback?.headers || [],
                body: callback?.body || '',
                bodyType: callback?.bodyType || 'INLINE',
                filePath: callback?.filePath || '',
                sendFileAsBody: callback?.sendFileAsBody ?? true,
                databucketID: callback?.databucketID || ''
            };
            environment.callbacks.push(newCallback);

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true, callback: newCallback });
        }

        if (action === 'update') {
            if (!callbackUuid || !callback) return Response.json({ error: 'Missing callbackUuid or callback data' }, { status: 400 });

            const index = environment.callbacks.findIndex(c => c.uuid === callbackUuid);
            if (index === -1) return Response.json({ error: 'Callback not found' }, { status: 404 });

            environment.callbacks[index] = { ...environment.callbacks[index], ...callback };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        if (action === 'delete') {
            if (!callbackUuid) return Response.json({ error: 'Missing callbackUuid' }, { status: 400 });

            environment.callbacks = environment.callbacks.filter(c => c.uuid !== callbackUuid);

            // Note: We should ideally also remove references to this callback from routes/responses
            environment.routes.forEach(r => {
                r.responses.forEach(res => {
                    res.callbacks = res.callbacks.filter(cb => cb.uuid !== callbackUuid);
                });
            });

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing callbacks:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
