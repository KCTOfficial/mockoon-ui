/**
 * @jest-environment node
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { EnvironmentSchema, HighestMigrationId, repairRefs } from '@mockoon/commons';
import { POST, POST_ITEM } from '@/server/api/environments/duplicate';
import { copyName } from '@/server/lib/route-bundle';
import { normalizeEnvironment } from '@/server/lib/normalize-env';
import type { Environment } from '@/types/mockoon';

const MIN = 47202;
const MAX = 47206;

const response = () => ({ uuid: randomUUID(), body: '{}', statusCode: 200, label: 'OK', headers: [], rules: [], callbacks: [] });
const route = (uuid: string, method: string, endpoint: string, type = 'http') =>
    ({ uuid, type, method, endpoint, responses: [response()], documentation: '', responseMode: null, streamingMode: null, streamingInterval: 0 });

describe('copyName', () => {
    it.each([
        ['Demo Auth API', [], 'Demo Auth API (copy 1)'],
        ['Demo Auth API', ['Demo Auth API (copy 1)'], 'Demo Auth API (copy 2)'],
        ['Demo Auth API (copy 1)', ['Demo Auth API (copy 1)'], 'Demo Auth API (copy 2)'],
        ['Demo Auth API', ['demo auth api (COPY 1)'], 'Demo Auth API (copy 2)'],
        ['Demo Auth API', ['Demo Auth API (copy 2)'], 'Demo Auth API (copy 1)'],
    ])('%s with %j taken -> %s', (name, taken, expected) => {
        expect(copyName(name, taken)).toBe(expected);
    });
});

describe('/api/environments/duplicate', () => {
    let dir: string;
    const file = (name: string) => path.join(dir, 'data', name);
    const read = (name: string): Environment => JSON.parse(fs.readFileSync(file(name), 'utf-8'));
    const ids = { login: randomUUID(), me: randomUUID(), health: randomUUID(), group: randomUUID(), callback: randomUUID() };

    const post = async (handler: typeof POST, body: object) => {
        const res = await handler(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }));
        return { status: res.status, data: await res.json() };
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-dup-'));
        fs.mkdirSync(path.join(dir, 'data'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        process.env.MOCKOON_PORT_RANGE = `${MIN}-${MAX}`;
        fs.writeFileSync(file('demo-auth-api.json'), JSON.stringify(normalizeEnvironment({
            uuid: randomUUID(),
            lastMigration: HighestMigrationId,
            name: 'Demo Auth API',
            port: MIN,
            data: [{ uuid: randomUUID(), id: 'usr1', name: 'Users', documentation: '', value: '[]' }],
            routes: [route(ids.login, 'post', 'auth/login'), route(ids.me, 'get', 'me'), route(ids.health, 'get', 'health')],
            folders: [{ uuid: ids.group, name: 'Profile', children: [{ type: 'route', uuid: ids.me }] }],
            rootChildren: [{ type: 'route', uuid: ids.login }, { type: 'folder', uuid: ids.group }, { type: 'route', uuid: ids.health }],
        })));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.MOCKOON_PORT_RANGE;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const expectValid = (env: Environment) => {
        expect(EnvironmentSchema.validate(env).error).toBeUndefined();
        const repaired = repairRefs(structuredClone(env));
        expect(repaired.rootChildren).toEqual(env.rootChildren);
        expect(repaired.folders).toEqual(env.folders);
    };

    describe('environment', () => {
        it('duplicates as "(copy 1)" on a free port with new uuids', async () => {
            const { status, data } = await post(POST, { filename: 'demo-auth-api.json' });
            expect(status).toBe(200);
            expect(data.environment).toMatchObject({ name: 'Demo Auth API (copy 1)', port: MIN + 1, filename: 'demo-auth-api-copy-1.json' });

            const original = read('demo-auth-api.json');
            const copy = read('demo-auth-api-copy-1.json');
            expect(copy.uuid).not.toBe(original.uuid);
            expect(copy.routes.map(r => r.endpoint)).toEqual(original.routes.map(r => r.endpoint));
            expect(copy.routes.map(r => r.uuid)).not.toContain(ids.login);
            expect(copy.folders[0].name).toBe('Profile');
            expect(copy.folders[0].children[0].uuid).toBe(copy.routes.find(r => r.endpoint === 'me')!.uuid);
            expect(copy.data[0].id).toBe('usr1');
            expect('filename' in copy).toBe(false);
            expectValid(copy);
        });

        it('counts up and skips ports that are in use', async () => {
            const blocker = await new Promise<net.Server>(resolve => {
                const s = net.createServer();
                s.listen(MIN + 1, '0.0.0.0', () => resolve(s));
            });
            try {
                await post(POST, { filename: 'demo-auth-api.json' });
                const second = await post(POST, { filename: 'demo-auth-api.json' });
                const third = await post(POST, { filename: 'demo-auth-api-copy-1.json' });
                expect(second.data.environment).toMatchObject({ name: 'Demo Auth API (copy 2)', port: MIN + 3 });
                expect(third.data.environment).toMatchObject({ name: 'Demo Auth API (copy 3)', port: MIN + 4 });
            } finally {
                await new Promise(resolve => blocker.close(resolve));
            }
        });

        it('refuses when the range is full and writes nothing', async () => {
            process.env.MOCKOON_PORT_RANGE = `${MIN}-${MIN}`;
            const { status } = await post(POST, { filename: 'demo-auth-api.json' });
            expect(status).toBe(409);
            expect(fs.readdirSync(path.join(dir, 'data'))).toEqual(['demo-auth-api.json']);
        });

        it.each(['../config/settings.json', 'missing.json', 42])('refuses %p', async (filename) => {
            expect((await post(POST, { filename })).status).toBe(404);
        });
    });

    describe('route or folder', () => {
        it('duplicates a route right after it, with a path of its own', async () => {
            const first = await post(POST_ITEM, { filename: 'demo-auth-api.json', itemType: 'route', itemUuid: ids.login });
            const second = await post(POST_ITEM, { filename: 'demo-auth-api.json', itemType: 'route', itemUuid: ids.login });
            expect(first.status).toBe(200);

            const env = read('demo-auth-api.json');
            expect(env.rootChildren.map(c => c.uuid)).toEqual([ids.login, second.data.itemUuid, first.data.itemUuid, ids.group, ids.health]);
            expect(env.routes.find(r => r.uuid === first.data.itemUuid)).toMatchObject({ method: 'post', endpoint: 'auth/login-copy-1' });
            expect(env.routes.find(r => r.uuid === second.data.itemUuid)!.endpoint).toBe('auth/login-copy-2');
            const responseIds = env.routes.flatMap(r => r.responses.map(res => res.uuid));
            expect(new Set(responseIds).size).toBe(responseIds.length);
            expectValid(env);
        });

        it('duplicates a route inside its folder', async () => {
            const { data } = await post(POST_ITEM, { filename: 'demo-auth-api.json', itemType: 'route', itemUuid: ids.me });
            const env = read('demo-auth-api.json');
            expect(env.folders[0].children.map(c => c.uuid)).toEqual([ids.me, data.itemUuid]);
            expect(env.rootChildren).toHaveLength(3);
        });

        it('duplicates a folder as "(copy 1)" with copies of its routes', async () => {
            const { data } = await post(POST_ITEM, { filename: 'demo-auth-api.json', itemType: 'folder', itemUuid: ids.group });
            const env = read('demo-auth-api.json');
            const copy = env.folders.find(f => f.uuid === data.itemUuid)!;
            expect(copy.name).toBe('Profile (copy 1)');
            expect(env.rootChildren.map(c => c.uuid)).toEqual([ids.login, ids.group, copy.uuid, ids.health]);
            const copiedRoute = env.routes.find(r => r.uuid === copy.children[0].uuid)!;
            // Routes inside keep their path; the copied folder is the new item
            expect(copiedRoute).toMatchObject({ endpoint: 'me' });
            expect(copiedRoute.uuid).not.toBe(ids.me);
            expectValid(env);
        });

        it.each([
            [{ itemType: 'route', itemUuid: randomUUID() }],
            [{ itemType: 'folder', itemUuid: ids.login }],
            [{ itemType: 'nope', itemUuid: ids.login }],
        ])('refuses %j', async (body) => {
            const before = fs.readFileSync(file('demo-auth-api.json'), 'utf-8');
            expect((await post(POST_ITEM, { filename: 'demo-auth-api.json', ...body })).status).toBe(404);
            expect(fs.readFileSync(file('demo-auth-api.json'), 'utf-8')).toBe(before);
        });
    });
});
