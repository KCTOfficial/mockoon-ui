/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { EnvironmentSchema, HighestMigrationId, repairRefs } from '@mockoon/commons';
import { GET, POST } from '@/server/api/environments/items-io';
import { normalizeEnvironment } from '@/server/lib/normalize-env';
import type { Environment } from '@/types/mockoon';

const response = (extra: Record<string, unknown> = {}) => ({ uuid: randomUUID(), body: '{}', statusCode: 200, label: '', headers: [], rules: [], callbacks: [], ...extra });
const route = (uuid: string, type: string, method: string, endpoint: string, responses = [response()]) =>
    ({ uuid, type, method, endpoint, responses, documentation: '', responseMode: null, streamingMode: null, streamingInterval: 0 });

describe('/api/environments/items (export / import)', () => {
    let dir: string;
    const file = (name: string) => path.join(dir, 'data', name);
    const read = (name: string): Environment => JSON.parse(fs.readFileSync(file(name), 'utf-8'));
    const write = (name: string, env: Record<string, unknown>) =>
        fs.writeFileSync(file(name), JSON.stringify(normalizeEnvironment({ lastMigration: HighestMigrationId, uuid: randomUUID(), ...env })));

    const exportItem = (params: Record<string, string>) =>
        GET(new Request(`http://localhost/api/environments/items/export?${new URLSearchParams(params)}`));

    const importFile = async (content: string, fields: Record<string, string> = {}, name = 'routes.json') => {
        const form = new FormData();
        form.append('file', new File([content], name, { type: 'application/json' }));
        Object.entries({ filename: 'target.json', ...fields }).forEach(([k, v]) => form.append(k, v));
        const res = await POST(new Request('http://localhost/api/environments/items/import', { method: 'POST', body: form }));
        return { status: res.status, data: await res.json() };
    };

    const ids = { login: randomUUID(), me: randomUUID(), ws: randomUUID(), group: randomUUID(), tFolder: randomUUID() };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-items-'));
        fs.mkdirSync(path.join(dir, 'data'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        write('source.json', {
            name: 'Demo Auth API',
            port: 7003,
            data: [{ uuid: randomUUID(), id: 'usr1', name: 'Users', documentation: '', value: '[]' }],
            routes: [
                route(ids.login, 'http', 'post', 'auth/login', [response({ body: '{{data \'usr1\'}}' })]),
                route(ids.me, 'http', 'get', '/me'),
                route(ids.ws, 'ws', 'get', 'live'),
            ],
            folders: [{ uuid: ids.group, name: 'Account & Profile', children: [{ type: 'route', uuid: ids.me }, { type: 'route', uuid: ids.ws }] }],
            rootChildren: [{ type: 'route', uuid: ids.login }, { type: 'folder', uuid: ids.group }],
        });
        write('target.json', {
            name: 'Target',
            port: 7004,
            folders: [{ uuid: ids.tFolder, name: 'Inbox', children: [] }],
            rootChildren: [{ type: 'folder', uuid: ids.tFolder }],
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const expectValid = (env: Environment) => {
        expect(EnvironmentSchema.validate(env).error).toBeUndefined();
        const repaired = repairRefs(structuredClone(env));
        expect(repaired.rootChildren).toEqual(env.rootChildren);
        expect(repaired.folders).toEqual(env.folders);
    };

    describe('export', () => {
        it('downloads a route as <environment>-<method>-<path>.json with the buckets it uses', async () => {
            const res = await exportItem({ filename: 'source.json', itemType: 'route', itemUuid: ids.login });
            expect(res.status).toBe(200);
            expect(res.headers.get('content-disposition')).toBe('attachment; filename="demo-auth-api-post-auth-login.json"');
            const bundle = await res.json();
            expect(bundle).toMatchObject({ type: 'mockoon-ui/routes', version: 1, exportedFrom: 'Demo Auth API' });
            expect(bundle.routes.map((r: { uuid: string }) => r.uuid)).toEqual([ids.login]);
            expect(bundle.data.map((b: { id: string }) => b.id)).toEqual(['usr1']);
            expect(bundle.rootChildren).toEqual([{ type: 'route', uuid: ids.login }]);
        });

        it('names folders and WebSocket routes clearly', async () => {
            const folder = await exportItem({ filename: 'source.json', itemType: 'folder', itemUuid: ids.group });
            expect(folder.headers.get('content-disposition')).toContain('filename="demo-auth-api-folder-account-profile.json"');
            const bundle = await folder.json();
            expect(bundle.routes).toHaveLength(2);
            expect(bundle.data).toEqual([]);

            const ws = await exportItem({ filename: 'source.json', itemType: 'route', itemUuid: ids.ws });
            expect(ws.headers.get('content-disposition')).toContain('filename="demo-auth-api-ws-live.json"');
        });

        it.each([
            [{ filename: 'source.json', itemType: 'route', itemUuid: randomUUID() }, 404],
            [{ filename: 'source.json', itemType: 'bucket', itemUuid: ids.login }, 404],
            [{ filename: '../config/settings.json', itemType: 'route', itemUuid: ids.login }, 404],
            [{ filename: 'missing.json', itemType: 'route', itemUuid: ids.login }, 404],
        ])('refuses %j', async (params, status) => {
            expect((await exportItem(params)).status).toBe(status);
        });
    });

    describe('import', () => {
        it('round-trips a folder export into a folder of another environment', async () => {
            const bundle = await (await exportItem({ filename: 'source.json', itemType: 'folder', itemUuid: ids.group })).text();
            const { status, data } = await importFile(bundle, { targetFolderUuid: ids.tFolder });

            expect(status).toBe(200);
            expect(data).toMatchObject({ kind: 'bundle', routeCount: 2, folderCount: 1, warnings: [] });
            const target = read('target.json');
            const inbox = target.folders.find(f => f.uuid === ids.tFolder)!;
            expect(inbox.children).toEqual([{ type: 'folder', uuid: data.itemUuids[0] }]);
            const group = target.folders.find(f => f.uuid === data.itemUuids[0])!;
            expect(group.name).toBe('Account & Profile');
            expect(group.children.map(c => target.routes.find(r => r.uuid === c.uuid)!.endpoint)).toEqual(['/me', 'live']);
            // New uuids, source untouched
            expect(target.routes.map(r => r.uuid)).not.toContain(ids.me);
            expect(read('source.json').routes).toHaveLength(3);
            expectValid(target);
        });

        it('imports a route with its data bucket at the top level, twice without uuid clashes', async () => {
            const bundle = await (await exportItem({ filename: 'source.json', itemType: 'route', itemUuid: ids.login })).text();
            const first = await importFile(bundle);
            const second = await importFile(bundle);

            expect(first.data).toMatchObject({ routeCount: 1, bucketCount: 1, warnings: [] });
            expect(second.data.bucketCount).toBe(0);
            expect(second.data.warnings).toEqual(['POST /auth/login already exists in "Target"; the route listed first answers.']);
            const target = read('target.json');
            expect(target.data.map(b => b.id)).toEqual(['usr1']);
            expect(new Set(target.routes.map(r => r.uuid)).size).toBe(2);
            expect(target.rootChildren.filter(c => c.type === 'route')).toHaveLength(2);
            expectValid(target);
        });

        it('takes every route and folder from a whole Mockoon environment file', async () => {
            const env = fs.readFileSync(file('source.json'), 'utf-8');
            const { status, data } = await importFile(env);

            expect(status).toBe(200);
            expect(data).toMatchObject({ kind: 'environment', routeCount: 3, folderCount: 1 });
            const target = read('target.json');
            // Target keeps its own name, port and uuid
            expect(target).toMatchObject({ name: 'Target', port: 7004 });
            expect(target.rootChildren).toHaveLength(3); // Inbox + login + group
            expectValid(target);
        });

        it('imports a file from an older Mockoon version (migrated first)', async () => {
            const old = { uuid: randomUUID(), lastMigration: 20, name: 'Old', port: 3000, routes: [route(randomUUID(), 'http', 'get', 'legacy')], folders: [], rootChildren: [] };
            const { status, data } = await importFile(JSON.stringify(old));
            expect(status).toBe(200);
            expect(data.routeCount).toBe(1);
            expectValid(read('target.json'));
        });

        it.each([
            ['invalid JSON', '{ nope', {}, 400],
            ['a JSON array', '[]', {}, 400],
            ['an object without routes', '{"name":"x"}', {}, 400],
            ['an export with no routes', JSON.stringify({ type: 'mockoon-ui/routes', version: 1, routes: [], rootChildren: [] }), {}, 400],
            ['an export from a newer version', JSON.stringify({ type: 'mockoon-ui/routes', version: 99, routes: [] }), {}, 400],
            ['an unknown target folder', null, { targetFolderUuid: randomUUID() }, 404],
            ['a missing target environment', null, { filename: 'missing.json' }, 404],
            ['a target outside data/', null, { filename: '../config/settings.json' }, 404],
        ])('refuses %s and leaves the target alone', async (_name, content, fields, status) => {
            const before = fs.readFileSync(file('target.json'), 'utf-8');
            const body = content ?? await (await exportItem({ filename: 'source.json', itemType: 'route', itemUuid: ids.me })).text();
            expect((await importFile(body, fields as Record<string, string>)).status).toBe(status);
            expect(fs.readFileSync(file('target.json'), 'utf-8')).toBe(before);
        });

        describe('into a new environment', () => {
            beforeEach(() => { process.env.MOCKOON_PORT_RANGE = '47302-47306'; });
            afterEach(() => { delete process.env.MOCKOON_PORT_RANGE; });

            it('creates it on a free port with the imported routes', async () => {
                const bundle = await (await exportItem({ filename: 'source.json', itemType: 'folder', itemUuid: ids.group })).text();
                const form = new FormData();
                form.append('file', new File([bundle], 'x.json'));
                form.append('newEnvironmentName', '  Profile API  ');
                const res = await POST(new Request('http://localhost/x', { method: 'POST', body: form }));
                const data = await res.json();

                expect(res.status).toBe(200);
                expect(data).toMatchObject({ created: true, routeCount: 2, folderCount: 1 });
                expect(data.target).toMatchObject({ name: 'Profile API', port: 47302, filename: 'profile-api.json' });
                const env = read('profile-api.json');
                expect(env.folders[0].name).toBe('Account & Profile');
                expect(env.rootChildren).toEqual([{ type: 'folder', uuid: env.folders[0].uuid }]);
                expect('filename' in env).toBe(false);
                expectValid(env);
                // Existing environments are untouched
                expect(read('target.json').routes).toHaveLength(0);
            });

            it.each([
                ['an empty name', '   ', 400],
                ['a name that is too long', 'x'.repeat(101), 400],
            ])('refuses %s', async (_name, newEnvironmentName, status) => {
                const bundle = await (await exportItem({ filename: 'source.json', itemType: 'route', itemUuid: ids.me })).text();
                const form = new FormData();
                form.append('file', new File([bundle], 'x.json'));
                form.append('newEnvironmentName', newEnvironmentName);
                const res = await POST(new Request('http://localhost/x', { method: 'POST', body: form }));
                expect(res.status).toBe(status);
                expect(fs.readdirSync(path.join(dir, 'data')).sort()).toEqual(['source.json', 'target.json']);
            });

            it('creates nothing when the file is invalid', async () => {
                const form = new FormData();
                form.append('file', new File(['{"name":"x"}'], 'x.json'));
                form.append('newEnvironmentName', 'Broken');
                const res = await POST(new Request('http://localhost/x', { method: 'POST', body: form }));
                expect(res.status).toBe(400);
                expect(fs.readdirSync(path.join(dir, 'data')).sort()).toEqual(['source.json', 'target.json']);
            });
        });

        it('refuses a request without a file', async () => {
            const form = new FormData();
            form.append('filename', 'target.json');
            const res = await POST(new Request('http://localhost/api/environments/items/import', { method: 'POST', body: form }));
            expect(res.status).toBe(400);
        });
    });
});
