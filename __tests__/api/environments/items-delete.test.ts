/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { EnvironmentSchema, HighestMigrationId, repairRefs } from '@mockoon/commons';
import { POST } from '@/server/api/environments/items-delete';
import { GET as trashGET, POST as trashPOST } from '@/server/api/environments/trash';
import { normalizeEnvironment } from '@/server/lib/normalize-env';
import type { Environment } from '@/types/mockoon';

const response = () => ({ uuid: randomUUID(), body: '{}', statusCode: 200, label: '', headers: [], rules: [], callbacks: [] });
const route = (uuid: string, method: string, endpoint: string) =>
    ({ uuid, type: 'http', method, endpoint, responses: [response()], documentation: '', responseMode: null, streamingMode: null, streamingInterval: 0 });

describe('/api/environments/items/delete', () => {
    let dir: string;
    const file = (name: string) => path.join(dir, 'data', name);
    const read = (): Environment => JSON.parse(fs.readFileSync(file('shop.json'), 'utf-8'));
    const ids = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID(), f1: randomUUID(), f2: randomUUID() };

    const del = async (body: Record<string, unknown>) => {
        const res = await POST(new Request('http://localhost/api/environments/items/delete', {
            method: 'POST',
            body: JSON.stringify({ filename: 'shop.json', ...body }),
        }));
        return { status: res.status, data: await res.json() };
    };
    const trashItems = async () => (await (await trashGET()).json()).items as { id: string; kind: string; name: string }[];

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-bulk-delete-'));
        fs.mkdirSync(path.join(dir, 'data'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // root [a, F1, d]; F1 [b, F2]; F2 [c]
        fs.writeFileSync(file('shop.json'), JSON.stringify(normalizeEnvironment({
            uuid: randomUUID(), lastMigration: HighestMigrationId, name: 'Shop', port: 7002,
            routes: [route(ids.a, 'get', 'a'), route(ids.b, 'get', 'b'), route(ids.c, 'get', 'c'), route(ids.d, 'get', 'd')],
            folders: [
                { uuid: ids.f1, name: 'Group', children: [{ type: 'route', uuid: ids.b }, { type: 'folder', uuid: ids.f2 }] },
                { uuid: ids.f2, name: 'Sub', children: [{ type: 'route', uuid: ids.c }] },
            ],
            rootChildren: [{ type: 'route', uuid: ids.a }, { type: 'folder', uuid: ids.f1 }, { type: 'route', uuid: ids.d }],
        })));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('puts each item in the recycle bin on its own and removes it, folders with everything in them', async () => {
        const { status, data } = await del({ items: [{ type: 'route', uuid: ids.a }, { type: 'folder', uuid: ids.f1 }] });

        expect(status).toBe(200);
        expect(data).toMatchObject({ routeCount: 3, folderCount: 2 });
        expect(data.routeUuids.sort()).toEqual([ids.a, ids.b, ids.c].sort());
        expect(data.trashIds).toHaveLength(2);
        expect(new Set(data.trashIds).size).toBe(2);

        const env = read();
        expect(env.routes.map(r => r.uuid)).toEqual([ids.d]);
        expect(env.folders).toEqual([]);
        expect(env.rootChildren).toEqual([{ type: 'route', uuid: ids.d }]);
        expect(data.target).toMatchObject({ filename: 'shop.json', routes: env.routes });
        expect(EnvironmentSchema.validate(env).error).toBeUndefined();
        expect(repairRefs(structuredClone(env)).rootChildren).toEqual(env.rootChildren);

        const items = await trashItems();
        expect(items.map(i => [i.kind, i.name]).sort()).toEqual([['folder', 'Group'], ['route', 'GET /a']]);
    });

    it('keeps many entries written in the same millisecond apart', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-11T10:00:00.000Z'));
        const { status, data } = await del({
            items: [{ type: 'route', uuid: ids.a }, { type: 'route', uuid: ids.b }, { type: 'route', uuid: ids.c }, { type: 'route', uuid: ids.d }],
        });
        expect(status).toBe(200);
        expect(new Set(data.trashIds).size).toBe(4);
        expect(await trashItems()).toHaveLength(4);
    });

    it('takes a route inside a listed folder with the folder, so it is in the bin once', async () => {
        const { data } = await del({ items: [{ type: 'route', uuid: ids.c }, { type: 'folder', uuid: ids.f2 }] });
        expect(data.trashIds).toHaveLength(1);
        expect(read().folders.map(f => f.uuid)).toEqual([ids.f1]);
        expect(read().folders[0].children).toEqual([{ type: 'route', uuid: ids.b }]);
    });

    it('restores a folder deleted this way to where it was', async () => {
        const { data } = await del({ items: [{ type: 'folder', uuid: ids.f2 }] });
        const res = await trashPOST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ action: 'restore', id: data.trashIds[0] }) }));
        expect(res.status).toBe(200);
        const env = read();
        const group = env.folders.find(f => f.uuid === ids.f1)!;
        const restored = env.folders.find(f => f.name === 'Sub')!;
        expect(group.children).toContainEqual({ type: 'folder', uuid: restored.uuid });
        expect(env.routes.find(r => r.uuid === restored.children[0].uuid)).toMatchObject({ endpoint: 'c' });
    });

    it.each([
        ['no items', {}, 400],
        ['an empty list', { items: [] }, 400],
        ['an unknown route', { items: [{ type: 'route', uuid: ids.a }, { type: 'route', uuid: randomUUID() }] }, 404],
        ['a folder given as a route', { items: [{ type: 'route', uuid: ids.f1 }] }, 404],
        ['a missing environment', { filename: 'missing.json', items: [{ type: 'route', uuid: ids.a }] }, 404],
        ['a file outside data/', { filename: '../config/settings.json', items: [{ type: 'route', uuid: ids.a }] }, 404],
    ])('refuses %s and changes nothing', async (_name, body, status) => {
        const before = fs.readFileSync(file('shop.json'), 'utf-8');
        expect((await del(body)).status).toBe(status);
        expect(fs.readFileSync(file('shop.json'), 'utf-8')).toBe(before);
        expect(await trashItems()).toEqual([]);
    });
});
