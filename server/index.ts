import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseArgs } from 'util';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { authRoutes, requireSession } from './auth';
import { loadEnvironments } from './lib/data-dir';
import * as action from './api/action';
import * as logs from './api/logs';
import * as logsStream from './api/logs-stream';
import * as callbacks from './api/environments/callbacks';
import * as create from './api/environments/create';
import * as databuckets from './api/environments/databuckets';
import * as deleteEnv from './api/environments/delete';
import * as folders from './api/environments/folders';
import * as importEnv from './api/environments/import';
import * as importOpenApi from './api/environments/import-openapi';
import * as responses from './api/environments/responses';
import * as routes from './api/environments/routes';
import * as update from './api/environments/update';
import * as updateRoute from './api/environments/update-route';

// Reject cross-origin state-changing requests (e.g. a form posted from a mock server on another port of the same host).
const sameOriginOnly: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        let originHost: string;
        try {
            originHost = new URL(origin).host;
        } catch {
            return c.json({ error: 'Forbidden' }, 403);
        }
        const allowed = [c.req.header('x-forwarded-host'), c.req.header('host')].filter(Boolean);
        if (!allowed.includes(originHost)) {
            return c.json({ error: 'Forbidden' }, 403);
        }
    }
    await next();
};

export const app = new Hono();

app.use('/api/*', sameOriginOnly);
app.route('/api/auth', authRoutes);
app.use('/api/*', requireSession);

app.get('/api/environments', (c) => c.json({ environments: loadEnvironments() }));
app.get('/api/action', () => action.GET());
app.post('/api/action', (c) => action.POST(c.req.raw));
app.get('/api/logs', (c) => logs.GET(c.req.raw));
app.get('/api/logs/stream', (c) => logsStream.GET(c.req.raw));
app.post('/api/environments/callbacks', (c) => callbacks.POST(c.req.raw));
app.get('/api/environments/create', () => create.GET());
app.post('/api/environments/create', (c) => create.POST(c.req.raw));
app.post('/api/environments/databuckets', (c) => databuckets.POST(c.req.raw));
app.post('/api/environments/delete', (c) => deleteEnv.POST(c.req.raw));
app.post('/api/environments/folders', (c) => folders.POST(c.req.raw));
app.post('/api/environments/import', (c) => importEnv.POST(c.req.raw));
app.post('/api/environments/import-openapi', (c) => importOpenApi.POST(c.req.raw));
app.post('/api/environments/responses', (c) => responses.POST(c.req.raw));
app.post('/api/environments/routes', (c) => routes.POST(c.req.raw));
app.post('/api/environments/update', (c) => update.POST(c.req.raw));
app.post('/api/environments/update-route', (c) => updateRoute.POST(c.req.raw));
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Production: serve the Vite build and fall back to index.html for client-side views
const clientDir = path.join(process.cwd(), 'dist', 'client');
if (fs.existsSync(clientDir)) {
    const root = path.relative(process.cwd(), clientDir);
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ root, path: 'index.html' }));
}

// `--port` lets the dev script run the API next to the Vite dev server
const { values: args } = parseArgs({ options: { port: { type: 'string' } }, strict: false });
const port = Number(args.port) || Number(process.env.PORT) || 7001;
// Not HOSTNAME: Docker sets that to the container id
const hostname = process.env.HOST || '0.0.0.0';

serve({ fetch: app.fetch, port, hostname }, (info) => {
    // 0.0.0.0 only means "all interfaces"; print addresses that can actually be opened
    if (hostname !== '0.0.0.0') {
        console.log(`Mockoon UI listening on http://${hostname}:${info.port}`);
        return;
    }
    const lan = Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
        .map(i => `http://${i.address}:${info.port}`);
    console.log(`Mockoon UI listening on all interfaces, port ${info.port}`);
    console.log(`  Local:   http://localhost:${info.port}`);
    lan.forEach(url => console.log(`  Network: ${url}`));
});
