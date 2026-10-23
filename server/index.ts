import fs from 'fs';
import os from 'os';
import path from 'path';
import type http from 'http';
import type { AddressInfo } from 'net';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { authRoutes, requireSession } from './auth';
import { accountRoutes } from './account';
import { loadEnvironments } from './lib/data-dir';
import { getPortRange } from './lib/port-range';
import { getFirewall, getUiHost, getUiPort, isSetupRequired, logSetupRequired } from './lib/settings';
import { createSetupRoutes } from './setup';
import * as action from './api/action';
import * as logs from './api/logs';
import * as logsStream from './api/logs-stream';
import * as callbacks from './api/environments/callbacks';
import * as create from './api/environments/create';
import * as databuckets from './api/environments/databuckets';
import * as deleteEnv from './api/environments/delete';
import * as exportEnv from './api/environments/export';
import * as folders from './api/environments/folders';
import * as importEnv from './api/environments/import';
import * as importOpenApi from './api/environments/import-openapi';
import * as ports from './api/environments/ports';
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
app.route('/api/setup', createSetupRoutes({ currentPort, moveTo }));
app.use('/api/*', requireSession);
app.route('/api/account', accountRoutes);

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
app.get('/api/environments/export', (c) => exportEnv.GET(c.req.raw));
app.post('/api/environments/folders', (c) => folders.POST(c.req.raw));
app.post('/api/environments/import', (c) => importEnv.POST(c.req.raw));
app.post('/api/environments/import-openapi', (c) => importOpenApi.POST(c.req.raw));
app.get('/api/environments/ports', () => ports.GET());
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

// Port: --port (dev script) > PORT (Docker) > first-run setup > 7001
const hostname = getUiHost();

// Fail fast on a malformed MOCKOON_PORT_RANGE, MOCKOON_FIREWALL or config/settings.json instead of on the first request
getFirewall();
const portRange = getPortRange();
console.log(`Mock server port range: ${portRange.min}-${portRange.max}`);

function listen(port: number) {
    return serve({ fetch: app.fetch, port, hostname }, (info) => {
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
}

let server = listen(getUiPort());

function currentPort() {
    return (server.address() as AddressInfo).port;
}

/** Switches to the port chosen in the setup; the old port keeps serving if the new one cannot be opened. */
function moveTo(port: number) {
    const next = listen(port);
    next.once('listening', () => {
        const previous = server;
        server = next;
        previous.close();
        (previous as http.Server).closeAllConnections();
    });
    next.once('error', (error) => {
        console.error(`Could not move Mockoon UI to port ${port}: ${error.message}`);
    });
}

if (isSetupRequired()) {
    logSetupRequired();
}
