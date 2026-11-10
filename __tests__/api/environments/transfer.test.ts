/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { EnvironmentSchema, HighestMigrationId, repairRefs } from '@mockoon/commons';
import { POST } from '@/server/api/environments/transfer';
import { normalizeEnvironment } from '@/server/lib/normalize-env';
import type { Environment, Route } from '@/types/mockoon';

type Partial = Record<string, unknown>;

const response = (extra: Partial = {}) => ({ uuid: randomUUID(), body: '{}', statusCode: 200, label: '', headers: [], rules: [], callbacks: [], ...extra });
const route = (uuid: string, type: 'http' | 'crud' | 'ws', method: string, endpoint: string, responses = [response()]) =>
    ({ uuid, type, method, endpoint, responses, documentation: '', responseMode: null, streamingMode: null, streamingInterval: 0 });
const bucket = (id: string, name: string, value = '[]') => ({ uuid: randomUUID(), id, name, documentation: '', value });

describe('/api/environments/transfer', () => {
    let dir: string;
    const file = (name: string) => path.join(dir, 'data', name);
    const read = (name: string): Environment => JSON.parse(fs.readFileSync(file(name), 'utf-8'));
    const write = (name: string, env: Partial) =>
        fs.writeFileSync(file(name), JSON.stringify(normalizeEnvironment({ lastMigration: HighestMigrationId, uuid: randomUUID(), ...env })));

    const post = async (body: Partial) => {
        const res = await POST(new Request('http://localhost/api/environments/transfer', {
            method: 'POST',
            body: JSON.stringify({ sourceFilename: 'source.json', targetFilename: 'target.json', ...body }),
        }));
        return { status: res.status, data: await res.json() };
    };

    // Source tree: root [http, crud, F1]; F1 [ws, F2]; F2 [nested]
    const ids = { http: randomUUID(), crud: randomUUID(), ws: randomUUID(), nested: randomUUID(), f1: randomUUID(), f2: randomUUID(), callback: randomUUID(), tFolder: randomUUID() };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-transfer-'));
        fs.mkdirSync(path.join(dir, 'data'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'error').mockImplementation(() => {});

        write('source.json', {
            name: 'Source',
            port: 7002,
            data: [bucket('usr1', 'Users'), bucket('ord1', 'Orders'), bucket('cbk1', 'Callback data'), bucket('unused', 'Unused')],
            callbacks: [{ uuid: ids.callback, id: 'cb01', name: 'Notify', documentation: '', method: 'post', uri: 'http://x', headers: [], body: '{{data \'Callback\'}}', bodyType: 'INLINE', filePath: '', sendFileAsBody: false, databucketID: '' }],
            routes: [
                route(ids.http, 'http', 'get', 'users', [response({ body: '{{data \'users\'}}' })]),
                route(ids.crud, 'crud', '', 'orders', [response({ bodyType: 'DATABUCKET', databucketID: 'ord1' })]),
                route(ids.ws, 'ws', 'get', 'socket', [response({ callbacks: [{ uuid: ids.callback, latency: 0 }] })]),
                route(ids.nested, 'http', 'post', 'nested'),
            ],
            folders: [
                { uuid: ids.f1, name: 'Group', children: [{ type: 'route', uuid: ids.ws }, { type: 'folder', uuid: ids.f2 }] },
                { uuid: ids.f2, name: 'Sub', children: [{ type: 'route', uuid: ids.nested }] },
            ],
            rootChildren: [{ type: 'route', uuid: ids.http }, { type: 'route', uuid: ids.crud }, { type: 'folder', uuid: ids.f1 }],
        });
        write('target.json', {
            name: 'Target',
            port: 7003,
            routes: [route(randomUUID(), 'http', 'get', '/users')],
            folders: [{ uuid: ids.tFolder, name: 'Imported', children: [] }],
            rootChildren: [],
        });
        // repairRefs in normalize puts the existing route at the root
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const expectValid = (name: string) => {
        const env = read(name);
        expect(EnvironmentSchema.validate(env).error).toBeUndefined();
        const repaired = repairRefs(structuredClone(env));
        expect(repaired.rootChildren).toEqual(env.rootChildren);
        expect(repaired.folders).toEqual(env.folders);
    };

    it('copies an HTTP route to the target root with new uuids and leaves the source alone', async () => {
        const before = fs.readFileSync(file('source.json'), 'utf-8');
        const { status, data } = await post({ itemType: 'route', itemUuid: ids.http, mode: 'copy' });

        expect(status).toBe(200);
        expect(fs.readFileSync(file('source.json'), 'utf-8')).toBe(before);
        const target = read('target.json');
        const copy = target.routes.find(r => r.endpoint === 'users' && r.uuid === data.itemUuid) as Route;
        expect(copy.uuid).not.toBe(ids.http);
        const original = read('source.json').routes.find(r => r.uuid === ids.http)!;
        expect(copy.responses[0].uuid).not.toBe(original.responses[0].uuid);
        expect(target.rootChildren).toContainEqual({ type: 'route', uuid: copy.uuid });
        // {{data 'users'}} matches the "Users" bucket by name, like Mockoon does
        expect(target.data.map(b => b.id)).toEqual(['usr1']);
        // Same endpoint already there
        expect(data.warnings.join(' ')).toContain('GET /users already exists');
        expectValid('target.json');
    });

    it('moves a CRUD route into a target folder with its data bucket', async () => {
        const { status, data } = await post({ itemType: 'route', itemUuid: ids.crud, mode: 'move', targetFolderUuid: ids.tFolder });

        expect(status).toBe(200);
        const source = read('source.json');
        expect(source.routes.some(r => r.uuid === ids.crud)).toBe(false);
        expect(source.rootChildren.some(c => c.uuid === ids.crud)).toBe(false);
        expect(source.data).toHaveLength(4); // buckets stay in the source

        const target = read('target.json');
        expect(target.folders.find(f => f.uuid === ids.tFolder)!.children).toEqual([{ type: 'route', uuid: data.itemUuid }]);
        expect(target.routes.find(r => r.uuid === data.itemUuid)).toMatchObject({ type: 'crud', endpoint: 'orders' });
        expect(target.data.map(b => b.id)).toEqual(['ord1']);
        expect(data.warnings).toEqual([]);
        expectValid('source.json');
        expectValid('target.json');
    });

    it('moves a folder with its subfolder, routes, callbacks and the buckets they use', async () => {
        const { status, data } = await post({ itemType: 'folder', itemUuid: ids.f1, mode: 'move' });

        expect(status).toBe(200);
        expect(data).toMatchObject({ routeCount: 2, folderCount: 2, callbackCount: 1, bucketCount: 1 });

        const source = read('source.json');
        expect(source.folders).toEqual([]);
        expect(source.routes.map(r => r.uuid).sort()).toEqual([ids.http, ids.crud].sort());
        expect(source.rootChildren.map(c => c.uuid)).toEqual([ids.http, ids.crud]);

        const target = read('target.json');
        const group = target.folders.find(f => f.uuid === data.itemUuid)!;
        expect(group.name).toBe('Group');
        expect(target.rootChildren).toContainEqual({ type: 'folder', uuid: group.uuid });
        const [wsRef, subRef] = group.children;
        expect(target.routes.find(r => r.uuid === wsRef.uuid)).toMatchObject({ type: 'ws', endpoint: 'socket' });
        const sub = target.folders.find(f => f.uuid === subRef.uuid)!;
        expect(sub.name).toBe('Sub');
        expect(target.routes.find(r => r.uuid === sub.children[0].uuid)).toMatchObject({ method: 'post', endpoint: 'nested' });
        // New uuids everywhere
        expect([group.uuid, sub.uuid, wsRef.uuid]).not.toContain(ids.f1);
        // The ws route's callback and the bucket the callback's template uses
        expect(target.callbacks.map(c => c.uuid)).toEqual([ids.callback]);
        expect(target.data.map(b => b.id)).toEqual(['cbk1']);
        expectValid('source.json');
        expectValid('target.json');
    });

    it('copies a folder twice without uuid clashes', async () => {
        const first = await post({ itemType: 'folder', itemUuid: ids.f1, mode: 'copy' });
        const second = await post({ itemType: 'folder', itemUuid: ids.f1, mode: 'copy' });

        expect(first.data.itemUuid).not.toBe(second.data.itemUuid);
        const target = read('target.json');
        const uuids = [...target.routes.map(r => r.uuid), ...target.folders.map(f => f.uuid)];
        expect(new Set(uuids).size).toBe(uuids.length);
        // Callback and bucket are identical the second time: not added again, no warning about them
        expect(target.callbacks).toHaveLength(1);
        expect(target.data).toHaveLength(1);
        expect(first.data.warnings).toEqual([]);
        // ...but the endpoints now exist twice, which is reported
        expect(second.data.warnings).toEqual([
            'GET /socket already exists in "Target"; the route listed first answers.',
            'POST /nested already exists in "Target"; the route listed first answers.',
        ]);
        expectValid('target.json');
    });

    it('keeps the target bucket with the same id and warns when its content differs', async () => {
        write('target.json', { name: 'Target', port: 7003, data: [bucket('ord1', 'Orders', '[{"id":1}]')] });
        const { data } = await post({ itemType: 'route', itemUuid: ids.crud, mode: 'copy' });

        const target = read('target.json');
        expect(target.data).toHaveLength(1);
        expect(target.data[0].value).toBe('[{"id":1}]');
        expect(data.warnings.join(' ')).toContain('Data bucket "Orders" (ord1) already exists');
    });

    it('copies buckets used by setData and data_bucket rules', async () => {
        const rid = randomUUID();
        const env = read('source.json');
        env.routes.push(route(rid, 'http', 'put', 'x', [response({
            body: '{{setData \'push\' \'ord1\' \'\' 1}}',
            rules: [{ target: 'data_bucket', modifier: 'usr1.0.name', value: 'a', invert: false, operator: 'equals' }],
        })]) as unknown as Route);
        env.rootChildren.push({ type: 'route', uuid: rid });
        fs.writeFileSync(file('source.json'), JSON.stringify(env));

        await post({ itemType: 'route', itemUuid: rid, mode: 'copy' });
        expect(read('target.json').data.map(b => b.id).sort()).toEqual(['ord1', 'usr1']);
    });

    describe('refuses', () => {
        it.each([
            ['the same environment', { targetFilename: 'source.json', itemType: 'route', itemUuid: ids.http, mode: 'copy' }, 400],
            ['an unknown mode', { itemType: 'route', itemUuid: ids.http, mode: 'link' }, 400],
            ['an unknown item type', { itemType: 'bucket', itemUuid: ids.http, mode: 'copy' }, 400],
            ['an unknown route', { itemType: 'route', itemUuid: randomUUID(), mode: 'move' }, 404],
            ['a folder uuid given as a route', { itemType: 'route', itemUuid: ids.f1, mode: 'move' }, 404],
            ['an unknown target folder', { itemType: 'route', itemUuid: ids.http, mode: 'move', targetFolderUuid: randomUUID() }, 404],
            ['a target outside data/', { targetFilename: '../config/settings.json', itemType: 'route', itemUuid: ids.http, mode: 'copy' }, 404],
            ['a missing target', { targetFilename: 'missing.json', itemType: 'route', itemUuid: ids.http, mode: 'copy' }, 404],
        ])('%s', async (_name, body, status) => {
            const before = [fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')];
            expect((await post(body)).status).toBe(status);
            expect([fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')]).toEqual(before);
        });
    });
});
