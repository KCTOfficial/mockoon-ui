/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

type SetupModule = typeof import('@/server/setup');
type SettingsModule = typeof import('@/server/lib/settings');

jest.mock('@/server/lib/data-dir', () => ({ loadEnvironments: () => [] }));

describe('/api/setup', () => {
    let dir: string;
    let setup: SetupModule;
    let settings: SettingsModule;
    const moveTo = jest.fn();

    const post = (body: object) =>
        setup.createSetupRoutes({ currentPort: () => 7001, moveTo }).request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

    const validBody = () => ({
        username: 'admin',
        password: 'password1',
        uiPort: 7001,
        mockPortMin: 7002,
        mockPortMax: 7020,
    });

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-setup-'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        delete process.env.MOCKOON_UI_USERNAME;
        delete process.env.MOCKOON_UI_PASSWORD;
        delete process.env.MOCKOON_PORT_RANGE;
        delete process.env.PORT;
        process.env.MOCKOON_FIREWALL = 'ufw';
        // Fresh modules per test: settings caches the file content
        await jest.isolateModulesAsync(async () => {
            setup = await import('@/server/setup');
            settings = await import('@/server/lib/settings');
        });
        moveTo.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.MOCKOON_FIREWALL;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reports what the setup needs', async () => {
        const res = await setup.createSetupRoutes({ currentPort: () => 7001, moveTo }).request('/');
        expect(await res.json()).toEqual({
            required: true,
            needsCredentials: true,
            uiPort: { value: 7001, locked: false },
            mockPortRange: { min: 1, max: 65535, locked: false },
            firewall: 'ufw',
        });
    });

    it('rejects a UI port inside the mock range', async () => {
        const res = await post({ ...validBody(), uiPort: 7010 });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('outside the mock server range');
    });

    it('rejects a short password', async () => {
        const res = await post({ ...validBody(), password: 'short' });
        expect(res.status).toBe(400);
    });

    it('saves the setup, signs in and runs only once', async () => {
        const res = await post(validBody());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, uiPort: 7001, moved: false });
        expect(res.headers.get('set-cookie')).toContain('mockoon_ui_session=');
        expect(moveTo).not.toHaveBeenCalled();

        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'config', 'settings.json'), 'utf-8'));
        expect(saved).toMatchObject({ username: 'admin', uiPort: 7001, mockPortRange: { min: 7002, max: 7020 } });
        expect(saved.passwordHash).toMatch(/^scrypt\$/);
        expect(JSON.stringify(saved)).not.toContain('password1');

        expect(settings.isSetupRequired()).toBe(false);
        expect((await post(validBody())).status).toBe(409);
    });
});
