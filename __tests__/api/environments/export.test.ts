/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

type ExportModule = typeof import('@/server/api/environments/export');
type ImportModule = typeof import('@/server/api/environments/import');

const DEMO_DIR = path.join(__dirname, '..', '..', '..', 'data');
const DEMO_FILES = fs.readdirSync(DEMO_DIR).filter(f => f.startsWith('demo-') && f.endsWith('.json'));

// Independent of the local config/settings.json (port range, UI port)
jest.mock('@/server/lib/settings', () => ({ getSettings: () => null, getUiPort: () => 7001 }));

describe('/api/environments/export', () => {
    let dir: string;
    let exportEnv: ExportModule;
    let importEnv: ImportModule;

    const exportFile = (filename: string) =>
        exportEnv.GET(new Request(`http://localhost/api/environments/export?filename=${encodeURIComponent(filename)}`));

    const importFile = async (name: string, content: string) => {
        const form = new FormData();
        form.append('file', new File([content], name, { type: 'application/json' }));
        const res = await importEnv.POST(new Request('http://localhost/api/environments/import', { method: 'POST', body: form }));
        return res.json();
    };

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-export-'));
        fs.mkdirSync(path.join(dir, 'data'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        // Fresh modules per test: import resolves the data dir when loaded
        await jest.isolateModulesAsync(async () => {
            exportEnv = await import('@/server/api/environments/export');
            importEnv = await import('@/server/api/environments/import');
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns the stored file unchanged, as a download', async () => {
        const content = fs.readFileSync(path.join(DEMO_DIR, DEMO_FILES[0]), 'utf-8');
        fs.writeFileSync(path.join(dir, 'data', 'my-api.json'), content);

        const res = await exportFile('my-api.json');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toContain('attachment; filename="my-api.json"');
        expect(await res.text()).toBe(content);
    });

    it.each(DEMO_FILES)('round-trips %s: import then export gives the imported environment back', async (file) => {
        const original = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, file), 'utf-8'));
        const imported = await importFile(file, JSON.stringify(original));
        expect(imported.success).toBe(true);

        const exported = await (await exportFile(imported.environment.filename)).json();
        // Import gives each copy a new uuid; everything else must match what was uploaded
        expect({ ...exported, uuid: original.uuid }).toEqual(original);
    });

    it('drops the UI-only filename field', async () => {
        const content = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, DEMO_FILES[0]), 'utf-8'));
        fs.writeFileSync(path.join(dir, 'data', 'x.json'), JSON.stringify({ ...content, filename: 'x.json' }));

        const exported = await (await exportFile('x.json')).json();
        expect(exported).not.toHaveProperty('filename');
    });

    it.each(['../package.json', 'missing.json', 'notes.txt'])('rejects %s', async (filename) => {
        expect((await exportFile(filename)).status).toBe(404);
    });
});
