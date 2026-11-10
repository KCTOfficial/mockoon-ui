/**
 * @jest-environment node
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { GET, POST } from '@/server/api/environments/trash';
import { POST as routesPOST } from '@/server/api/environments/routes';
import { HighestMigrationId } from '@mockoon/commons';
import { normalizeEnvironment } from '@/server/lib/normalize-env';

// High, unusual ports so the test does not depend on what runs on this machine
const MIN = 47102;
const MAX = 47105;

describe('/api/environments/trash', () => {
    let dir: string;
    const dataDir = () => path.join(dir, 'data');
    const trashDir = () => path.join(dir, 'data', '.deleted');

    const env = (name: string, port: number, uuid: string = randomUUID()) => ({
        uuid, name, port, lastMigration: 33, routes: [{ uuid: 'r1' }, { uuid: 'r2' }], folders: [], rootChildren: [],
    });
    const writeEnv = (filename: string, content: object) =>
        fs.writeFileSync(path.join(dataDir(), filename), JSON.stringify(content));
    const trash = (id: string, content: object | string) =>
        fs.writeFileSync(path.join(trashDir(), id), typeof content === 'string' ? content : JSON.stringify(content));
    const readData = (filename: string) => JSON.parse(fs.readFileSync(path.join(dataDir(), filename), 'utf-8'));

    const post = async (body: object) => {
        const res = await POST(new Request('http://localhost/api/environments/trash', { method: 'POST', body: JSON.stringify(body) }));
        return { status: res.status, data: await res.json() };
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-trash-'));
        fs.mkdirSync(trashDir(), { recursive: true });
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        process.env.MOCKOON_PORT_RANGE = `${MIN}-${MAX}`;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.MOCKOON_PORT_RANGE;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('GET', () => {
        it('is empty without a recycle bin folder', async () => {
            fs.rmSync(trashDir(), { recursive: true });
            expect(await (await GET()).json()).toEqual({ items: [] });
        });

        it('lists items newest first, with name, port, original file and time', async () => {
            trash('shop-api-2026-11-01T08-00-00-000Z.json', env('Shop API', MIN));
            trash('auth-api-2026-11-10T08-49-40-097Z.json', env('Auth API', MIN + 1));
            trash('broken-2026-11-05T00-00-00-000Z.json', '{ not json');

            const { items } = await (await GET()).json();
            expect(items.map((i: { name: string }) => i.name)).toEqual(['Auth API', 'broken', 'Shop API']);
            expect(items[0]).toEqual({
                id: 'auth-api-2026-11-10T08-49-40-097Z.json',
                kind: 'environment',
                name: 'Auth API',
                port: MIN + 1,
                originalFilename: 'auth-api.json',
                deletedAt: '2026-11-10T08:49:40.097Z',
                routeCount: 2,
                invalid: false,
            });
            expect(items[1].invalid).toBe(true);
        });
    });

    describe('restore', () => {
        const ID = 'shop-api-2026-11-10T08-00-00-000Z.json';

        it('keeps the old port and file name when both are free', async () => {
            const uuid = randomUUID();
            trash(ID, env('Shop API', MIN + 2, uuid));
            const { status, data } = await post({ action: 'restore', id: ID });

            expect(status).toBe(200);
            expect(data.portChanged).toBe(false);
            expect(data.environment).toMatchObject({ name: 'Shop API', port: MIN + 2, filename: 'shop-api.json', uuid });
            expect(readData('shop-api.json').port).toBe(MIN + 2);
            expect(fs.existsSync(path.join(trashDir(), ID))).toBe(false);
        });

        it('picks the next free port when another environment took the old one', async () => {
            writeEnv('other.json', env('Other', MIN));
            trash(ID, env('Shop API', MIN));
            const { data } = await post({ action: 'restore', id: ID });

            expect(data).toMatchObject({ portChanged: true, previousPort: MIN });
            expect(data.environment.port).toBe(MIN + 1);
            expect(readData('shop-api.json').port).toBe(MIN + 1);
        });

        it('skips ports another program is listening on', async () => {
            const blockers = await Promise.all([MIN, MIN + 1].map(port => new Promise<net.Server>((resolve, reject) => {
                const server = net.createServer();
                server.once('error', reject);
                server.listen(port, '0.0.0.0', () => resolve(server));
            })));
            try {
                trash(ID, env('Shop API', MIN));
                const { data } = await post({ action: 'restore', id: ID });
                expect(data.environment.port).toBe(MIN + 2);
                expect(data.portChanged).toBe(true);
            } finally {
                await Promise.all(blockers.map(s => new Promise(resolve => s.close(resolve))));
            }
        });

        it('moves a port that is now outside the range into it', async () => {
            trash(ID, env('Shop API', 7002));
            const { data } = await post({ action: 'restore', id: ID });
            expect(data.environment.port).toBe(MIN);
            expect(data).toMatchObject({ portChanged: true, previousPort: 7002 });
        });

        it('renames the file and replaces the uuid when they are taken', async () => {
            const same = randomUUID();
            writeEnv('shop-api.json', env('Shop API', MIN, same));
            trash(ID, env('Shop API', MIN + 1, same));
            const { data } = await post({ action: 'restore', id: ID });

            expect(data.environment.filename).toBe('shop-api-restored.json');
            expect(data.environment.uuid).not.toBe(same);
            expect(readData('shop-api-restored.json').uuid).toBe(data.environment.uuid);
            // The existing environment is untouched
            expect(readData('shop-api.json')).toMatchObject({ uuid: same, port: MIN });
        });

        it('refuses when the range is full and keeps the item', async () => {
            for (let port = MIN; port <= MAX; port++) writeEnv(`e${port}.json`, env(`E${port}`, port));
            trash(ID, env('Shop API', MIN));
            const { status } = await post({ action: 'restore', id: ID });

            expect(status).toBe(409);
            expect(fs.existsSync(path.join(trashDir(), ID))).toBe(true);
            expect(fs.existsSync(path.join(dataDir(), 'shop-api.json'))).toBe(false);
        });

        it('refuses an unreadable file', async () => {
            trash(ID, '{ not json');
            expect((await post({ action: 'restore', id: ID })).status).toBe(400);
        });
    });

    describe('delete and empty', () => {
        it('deletes one item permanently', async () => {
            trash('a-2026-11-10T08-00-00-000Z.json', env('A', MIN));
            trash('b-2026-11-10T08-00-00-000Z.json', env('B', MIN));
            const { status } = await post({ action: 'delete', id: 'a-2026-11-10T08-00-00-000Z.json' });

            expect(status).toBe(200);
            expect(fs.readdirSync(trashDir())).toEqual(['b-2026-11-10T08-00-00-000Z.json']);
        });

        it('empties the recycle bin', async () => {
            trash('a-2026-11-10T08-00-00-000Z.json', env('A', MIN));
            trash('b-2026-11-10T08-00-00-000Z.json', env('B', MIN));
            const { data } = await post({ action: 'empty' });

            expect(data).toEqual({ success: true, deleted: 2 });
            expect(fs.readdirSync(trashDir())).toEqual([]);
        });

        it.each([
            '../shop.json',
            '..\\shop.json',
            'missing.json',
            '.hidden.json',
            'not-json.txt',
        ])('rejects the id %s', async (id) => {
            writeEnv('shop.json', env('Shop', MIN));
            expect((await post({ action: 'delete', id })).status).toBe(404);
            expect((await post({ action: 'restore', id })).status).toBe(404);
            expect(fs.existsSync(path.join(dataDir(), 'shop.json'))).toBe(true);
        });
    });

    describe('deleted routes', () => {
        const ids = { users: randomUUID(), health: randomUUID(), folder: randomUUID() };

        const writeShop = () => fs.writeFileSync(path.join(dataDir(), 'shop.json'), JSON.stringify(normalizeEnvironment({
            uuid: randomUUID(),
            lastMigration: HighestMigrationId,
            name: 'Shop',
            port: MIN,
            data: [{ uuid: randomUUID(), id: 'usr1', name: 'Users', documentation: '', value: '[]' }],
            routes: [
                { uuid: ids.users, type: 'http', method: 'get', endpoint: 'users', responses: [{ uuid: randomUUID(), body: "{{data 'usr1'}}", headers: [], rules: [], callbacks: [] }] },
                { uuid: ids.health, type: 'http', method: 'get', endpoint: 'health', responses: [{ uuid: randomUUID(), headers: [], rules: [], callbacks: [] }] },
            ],
            folders: [{ uuid: ids.folder, name: 'Accounts', children: [{ type: 'route', uuid: ids.users }] }],
            rootChildren: [{ type: 'folder', uuid: ids.folder }, { type: 'route', uuid: ids.health }],
        })));

        const deleteRoute = (routeUuid: string) => routesPOST(new Request('http://localhost/x', {
            method: 'POST',
            body: JSON.stringify({ filename: 'shop.json', action: 'delete', routeUuid }),
        }));

        beforeEach(() => writeShop());

        it('lists a deleted route with where it came from', async () => {
            expect((await deleteRoute(ids.users)).status).toBe(200);
            expect(readData('shop.json').routes.map((r: { uuid: string }) => r.uuid)).toEqual([ids.health]);

            const { items } = await (await GET()).json();
            expect(items).toHaveLength(1);
            expect(items[0]).toMatchObject({
                kind: 'route',
                name: 'GET /users',
                deletedFrom: { filename: 'shop.json', envName: 'Shop', folderUuid: ids.folder, folderName: 'Accounts' },
                invalid: false,
            });
        });

        it('restores a route into its folder', async () => {
            await deleteRoute(ids.users);
            const { items } = await (await GET()).json();
            const { status, data } = await post({ action: 'restore', id: items[0].id });

            expect(status).toBe(200);
            expect(data).toMatchObject({ kind: 'route', name: 'GET /users', restoredToFolder: true, routeCount: 1, warnings: [] });
            const env = readData('shop.json');
            const folder = env.folders.find((f: { uuid: string }) => f.uuid === ids.folder);
            expect(folder.children).toEqual([{ type: 'route', uuid: data.itemUuids[0] }]);
            expect(env.routes.find((r: { uuid: string }) => r.uuid === data.itemUuids[0]).endpoint).toBe('users');
            // The bucket was still there: not added twice
            expect(env.data).toHaveLength(1);
            expect(fs.readdirSync(trashDir())).toEqual([]);
        });

        it('restores to the top level when its folder is gone', async () => {
            await deleteRoute(ids.users);
            const env = readData('shop.json');
            env.folders = [];
            env.rootChildren = env.rootChildren.filter((c: { uuid: string }) => c.uuid !== ids.folder);
            fs.writeFileSync(path.join(dataDir(), 'shop.json'), JSON.stringify(env));

            const { items } = await (await GET()).json();
            const { data } = await post({ action: 'restore', id: items[0].id });
            expect(data.restoredToFolder).toBe(false);
            expect(readData('shop.json').rootChildren).toContainEqual({ type: 'route', uuid: data.itemUuids[0] });
        });

        it('refuses while its environment is deleted, and keeps the item', async () => {
            await deleteRoute(ids.health);
            fs.rmSync(path.join(dataDir(), 'shop.json'));
            const { items } = await (await GET()).json();
            const { status, data } = await post({ action: 'restore', id: items[0].id });

            expect(status).toBe(409);
            expect(data.error).toBe('"Shop" no longer exists. Choose another environment to restore into.');
            expect(items[0].sourceMissing).toBe(true);
            expect(fs.readdirSync(trashDir())).toHaveLength(1);
        });

        it('restores into another environment and folder when its own is gone', async () => {
            await deleteRoute(ids.users);
            fs.renameSync(path.join(dataDir(), 'shop.json'), path.join(dataDir(), 'other.json'));
            const other = readData('other.json');
            const { items } = await (await GET()).json();

            const { status, data } = await post({ action: 'restore', id: items[0].id, targetFilename: 'other.json', targetFolderUuid: ids.folder });
            expect(status).toBe(200);
            expect(data.target.filename).toBe('other.json');
            const env = readData('other.json');
            expect(env.uuid).toBe(other.uuid);
            expect(env.folders.find((f: { uuid: string }) => f.uuid === ids.folder).children).toContainEqual({ type: 'route', uuid: data.itemUuids[0] });
            expect(fs.readdirSync(trashDir())).toEqual([]);
        });

        it.each([
            [{ targetFilename: 'missing.json' }, 404],
            [{ targetFilename: '../config/settings.json' }, 404],
            [{ targetFilename: 'shop.json', targetFolderUuid: 'nope' }, 404],
        ])('refuses the chosen target %j and keeps the item', async (choice, status) => {
            await deleteRoute(ids.health);
            const { items } = await (await GET()).json();
            expect((await post({ action: 'restore', id: items[0].id, ...choice })).status).toBe(status);
            expect(fs.readdirSync(trashDir())).toHaveLength(1);
        });

        it('deletes a route permanently', async () => {
            await deleteRoute(ids.health);
            const { items } = await (await GET()).json();
            expect((await post({ action: 'delete', id: items[0].id })).status).toBe(200);
            expect(fs.readdirSync(trashDir())).toEqual([]);
            expect(readData('shop.json').routes).toHaveLength(1);
        });
    });
});
