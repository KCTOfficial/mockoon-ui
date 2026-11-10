/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { POST } from '@/server/api/environments/folders';
import type { Environment } from '@/types/mockoon';

const route = (uuid: string) => ({ uuid, type: 'http', method: 'get', endpoint: uuid, responses: [] });

describe('/api/environments/folders', () => {
    let dir: string;
    const file = () => path.join(dir, 'data', 'test.json');
    const read = (): Environment => JSON.parse(fs.readFileSync(file(), 'utf-8'));

    const post = async (body: object) => {
        const res = await POST(new Request('http://localhost/api/environments/folders', {
            method: 'POST',
            body: JSON.stringify({ filename: 'test.json', ...body }),
        }));
        return { status: res.status, data: await res.json() };
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-folders-'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        fs.mkdirSync(path.join(dir, 'data'));
        // root: [r1, A]; A: [r2, B]; B: [r3]
        fs.writeFileSync(file(), JSON.stringify({
            uuid: 'env',
            name: 'Test',
            port: 7002,
            routes: [route('r1'), route('r2'), route('r3')],
            folders: [
                { uuid: 'A', name: 'A', children: [{ type: 'route', uuid: 'r2' }, { type: 'folder', uuid: 'B' }] },
                { uuid: 'B', name: 'B', children: [{ type: 'route', uuid: 'r3' }] },
            ],
            rootChildren: [{ type: 'route', uuid: 'r1' }, { type: 'folder', uuid: 'A' }],
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('creates a folder at the root and returns the new tree', async () => {
        const { status, data } = await post({ action: 'create', folder: { name: 'Users' } });
        expect(status).toBe(200);
        expect(data.folder.name).toBe('Users');
        expect(data.rootChildren).toContainEqual({ type: 'folder', uuid: data.folder.uuid });
        expect(read().folders).toHaveLength(3);
    });

    it('creates a folder inside another folder', async () => {
        const { data } = await post({ action: 'create', parentFolderUuid: 'B' });
        expect(data.folder.name).toBe('New folder');
        expect(read().folders.find(f => f.uuid === 'B')?.children).toContainEqual({ type: 'folder', uuid: data.folder.uuid });
    });

    it('renames a folder but ignores other fields', async () => {
        const { status } = await post({ action: 'update', folderUuid: 'A', folder: { name: ' Orders ', children: [], uuid: 'x' } });
        expect(status).toBe(200);
        const folder = read().folders.find(f => f.uuid === 'A');
        expect(folder?.name).toBe('Orders');
        expect(folder?.children).toHaveLength(2);
    });

    it('rejects an empty folder name', async () => {
        const { status } = await post({ action: 'update', folderUuid: 'A', folder: { name: '   ' } });
        expect(status).toBe(400);
    });

    it('deleting a folder moves its contents to the parent, in its place', async () => {
        const { status } = await post({ action: 'delete', folderUuid: 'A' });
        expect(status).toBe(200);
        const env = read();
        expect(env.folders.map(f => f.uuid)).toEqual(['B']);
        expect(env.rootChildren).toEqual([
            { type: 'route', uuid: 'r1' },
            { type: 'route', uuid: 'r2' },
            { type: 'folder', uuid: 'B' },
        ]);
        expect(env.routes).toHaveLength(3);
    });

    it('moves a route into a folder', async () => {
        await post({ action: 'move', itemType: 'route', itemUuid: 'r1', targetFolderUuid: 'B' });
        const env = read();
        expect(env.rootChildren).toEqual([{ type: 'folder', uuid: 'A' }]);
        expect(env.folders.find(f => f.uuid === 'B')?.children).toEqual([
            { type: 'route', uuid: 'r3' },
            { type: 'route', uuid: 'r1' },
        ]);
    });

    it('moves a route back to the root', async () => {
        await post({ action: 'move', itemType: 'route', itemUuid: 'r3', targetFolderUuid: null });
        const env = read();
        expect(env.rootChildren).toContainEqual({ type: 'route', uuid: 'r3' });
        expect(env.folders.find(f => f.uuid === 'B')?.children).toEqual([]);
    });

    it('refuses to move a folder into its own subfolder', async () => {
        const { status } = await post({ action: 'move', itemType: 'folder', itemUuid: 'A', targetFolderUuid: 'B' });
        expect(status).toBe(400);
        expect(read().rootChildren).toContainEqual({ type: 'folder', uuid: 'A' });
    });

    it('returns 404 for an unknown item or target', async () => {
        expect((await post({ action: 'move', itemType: 'route', itemUuid: 'nope' })).status).toBe(404);
        expect((await post({ action: 'move', itemType: 'route', itemUuid: 'r1', targetFolderUuid: 'nope' })).status).toBe(404);
        expect((await post({ action: 'delete', folderUuid: 'nope' })).status).toBe(404);
    });

    it('rejects a filename outside data/', async () => {
        const res = await POST(new Request('http://localhost/api/environments/folders', {
            method: 'POST',
            body: JSON.stringify({ filename: '../config/settings.json', action: 'create' }),
        }));
        expect(res.status).toBe(404);
    });
});
