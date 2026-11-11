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

    describe('several items', () => {
        it('moves routes and a folder to another environment in one go, in the order given', async () => {
            const { status, data } = await post({
                items: [{ type: 'folder', uuid: ids.f1 }, { type: 'route', uuid: ids.http }, { type: 'route', uuid: ids.crud }],
                mode: 'move',
                targetFolderUuid: ids.tFolder,
            });

            expect(status).toBe(200);
            expect(data).toMatchObject({ routeCount: 4, folderCount: 2, folderUuid: ids.tFolder });
            expect(data.itemUuids).toHaveLength(3);
            const source = read('source.json');
            expect(source.routes).toEqual([]);
            expect(source.folders).toEqual([]);
            expect(source.rootChildren).toEqual([]);
            const target = read('target.json');
            expect(target.folders.find(f => f.uuid === ids.tFolder)!.children.map(c => c.uuid)).toEqual(data.itemUuids);
            expectValid('source.json');
            expectValid('target.json');
        });

        it('takes an item inside a listed folder along with the folder, once', async () => {
            const { status, data } = await post({
                items: [{ type: 'route', uuid: ids.nested }, { type: 'folder', uuid: ids.f1 }, { type: 'folder', uuid: ids.f1 }],
                mode: 'copy',
            });

            expect(status).toBe(200);
            expect(data).toMatchObject({ routeCount: 2, folderCount: 2 });
            expect(data.itemUuids).toHaveLength(1);
            expect(read('target.json').routes.filter(r => r.endpoint === 'nested')).toHaveLength(1);
        });

        it('changes nothing when one of the items is missing', async () => {
            const before = [fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')];
            const { status } = await post({ items: [{ type: 'route', uuid: ids.http }, { type: 'route', uuid: randomUUID() }], mode: 'move' });
            expect(status).toBe(404);
            expect([fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')]).toEqual(before);
        });

        it.each([[[]], ['nope'], [[null]]])('refuses items %j', async (items) => {
            expect((await post({ items, mode: 'copy' })).status).toBe(items.length === 1 && items[0] === null ? 404 : 400);
        });
    });

    describe('into a new folder', () => {
        it('creates it inside the chosen folder of the target and puts the items in it', async () => {
            const { status, data } = await post({
                items: [{ type: 'route', uuid: ids.http }, { type: 'route', uuid: ids.crud }],
                mode: 'copy',
                targetFolderUuid: ids.tFolder,
                newFolderName: '  Copied  ',
            });

            expect(status).toBe(200);
            const target = read('target.json');
            const created = target.folders.find(f => f.uuid === data.folderUuid)!;
            expect(created.name).toBe('Copied');
            expect(created.children.map(c => c.uuid)).toEqual(data.itemUuids);
            expect(target.folders.find(f => f.uuid === ids.tFolder)!.children).toEqual([{ type: 'folder', uuid: created.uuid }]);
            expectValid('target.json');
        });

        it('creates it at the top level without a parent', async () => {
            const { data } = await post({ itemType: 'route', itemUuid: ids.http, mode: 'move', newFolderName: 'Users' });
            const target = read('target.json');
            expect(target.rootChildren).toContainEqual({ type: 'folder', uuid: data.folderUuid });
            expect(target.folders.find(f => f.uuid === data.folderUuid)!.children).toEqual([{ type: 'route', uuid: data.itemUuid }]);
        });

        it.each([[''], ['   '], ['x'.repeat(101)], [42]])('refuses the name %j and changes nothing', async (newFolderName) => {
            const before = [fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')];
            const { status, data } = await post({ itemType: 'route', itemUuid: ids.http, mode: 'move', newFolderName });
            expect(status).toBe(400);
            expect(data.error).toBe('Folder name must be 1-100 characters');
            expect([fs.readFileSync(file('source.json'), 'utf-8'), fs.readFileSync(file('target.json'), 'utf-8')]).toEqual(before);
        });
    });

    describe('inside the same environment', () => {
        const same = (body: Partial) => post({ targetFilename: 'source.json', ...body });

        it('moves items into a folder, keeping their uuids and their buckets', async () => {
            const { status, data } = await same({
                items: [{ type: 'route', uuid: ids.http }, { type: 'route', uuid: ids.crud }],
                mode: 'move',
                targetFolderUuid: ids.f2,
            });

            expect(status).toBe(200);
            expect(data).toMatchObject({ itemUuids: [ids.http, ids.crud], warnings: [], routeCount: 2 });
            const env = read('source.json');
            expect(env.routes).toHaveLength(4);
            expect(env.data).toHaveLength(4);
            expect(env.rootChildren).toEqual([{ type: 'folder', uuid: ids.f1 }]);
            expect(env.folders.find(f => f.uuid === ids.f2)!.children.map(c => c.uuid)).toEqual([ids.nested, ids.http, ids.crud]);
            expect(data.source).toEqual(data.target);
            expectValid('source.json');
        });

        it('moves a nested folder to the top level, and a new folder made for it', async () => {
            const { data } = await same({ itemType: 'folder', itemUuid: ids.f2, mode: 'move', newFolderName: 'Archive' });
            const env = read('source.json');
            const archive = env.folders.find(f => f.name === 'Archive')!;
            expect(data.folderUuid).toBe(archive.uuid);
            expect(env.rootChildren).toContainEqual({ type: 'folder', uuid: archive.uuid });
            expect(archive.children).toEqual([{ type: 'folder', uuid: ids.f2 }]);
            expect(env.folders.find(f => f.uuid === ids.f1)!.children).toEqual([{ type: 'route', uuid: ids.ws }]);
            expectValid('source.json');
        });

        it('refuses to move a folder into itself or a subfolder, without creating the new folder', async () => {
            const before = fs.readFileSync(file('source.json'), 'utf-8');
            for (const targetFolderUuid of [ids.f1, ids.f2]) {
                const { status, data } = await same({ itemType: 'folder', itemUuid: ids.f1, mode: 'move', targetFolderUuid, newFolderName: 'X' });
                expect(status).toBe(400);
                expect(data.error).toBe('A folder cannot be moved into itself');
            }
            expect(fs.readFileSync(file('source.json'), 'utf-8')).toBe(before);
        });

        it('copies with "-copy-N" paths and new uuids, and no warnings', async () => {
            const { status, data } = await same({
                items: [{ type: 'route', uuid: ids.http }, { type: 'folder', uuid: ids.f2 }],
                mode: 'copy',
                newFolderName: 'Copies',
            });

            expect(status).toBe(200);
            expect(data.warnings).toEqual([]);
            const env = read('source.json');
            expect(env.routes.map(r => r.endpoint).sort()).toEqual(['nested', 'nested-copy-1', 'orders', 'socket', 'users', 'users-copy-1']);
            const copies = env.folders.find(f => f.uuid === data.folderUuid)!;
            expect(copies.children.map(c => c.uuid)).toEqual(data.itemUuids);
            expect(data.itemUuids).not.toContain(ids.http);
            // Buckets and callbacks are already there
            expect(env.data).toHaveLength(4);
            expect(env.callbacks).toHaveLength(1);
            expectValid('source.json');
        });

        it('copies a folder into itself without looping', async () => {
            const { status } = await same({ itemType: 'folder', itemUuid: ids.f2, mode: 'copy', targetFolderUuid: ids.f2 });
            expect(status).toBe(200);
            const env = read('source.json');
            expect(env.folders).toHaveLength(3);
            expect(env.routes.filter(r => r.endpoint.startsWith('nested'))).toHaveLength(2);
            expectValid('source.json');
        });
    });

    describe('refuses', () => {
        it.each([
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
