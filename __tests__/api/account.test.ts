/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

type AccountModule = typeof import('@/server/account');
type SettingsModule = typeof import('@/server/lib/settings');
type AuthModule = typeof import('@/lib/auth');

describe('/api/account', () => {
    let dir: string;
    let account: AccountModule;
    let settings: SettingsModule;
    let auth: AuthModule;

    const post = (url: string, body: object) =>
        account.accountRoutes.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-account-'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        jest.spyOn(console, 'log').mockImplementation(() => {});
        delete process.env.MOCKOON_UI_USERNAME;
        delete process.env.MOCKOON_UI_PASSWORD;
        delete process.env.MOCKOON_UI_AUTH_SECRET;
        // Fresh modules per test: settings caches the file content
        await jest.isolateModulesAsync(async () => {
            account = await import('@/server/account');
            settings = await import('@/server/lib/settings');
            auth = await import('@/lib/auth');
        });
        settings.saveSettings({
            username: 'admin',
            passwordHash: settings.hashPassword('password1'),
            secret: 'secret-1',
            uiPort: 7001,
            mockPortRange: { min: 7002, max: 7020 },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
        delete process.env.MOCKOON_UI_USERNAME;
        delete process.env.MOCKOON_UI_PASSWORD;
    });

    it('reports the current login', async () => {
        const res = await account.accountRoutes.request('/');
        expect(await res.json()).toEqual({ username: 'admin', managedByEnv: false });
    });

    it('rejects a wrong current password', async () => {
        const res = await post('/', { currentPassword: 'nope', username: 'admin', newPassword: 'password2' });
        expect(res.status).toBe(403);
        expect(auth.verifyCredentials('admin', 'password1')).toBe(true);
    });

    it('changes username and password, and signs out other sessions', async () => {
        const oldSession = auth.createSessionToken() ?? undefined;
        const res = await post('/', { currentPassword: 'password1', username: 'owner', newPassword: 'password2' });
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toContain('mockoon_ui_session=');

        expect(auth.verifyCredentials('owner', 'password2')).toBe(true);
        expect(auth.verifyCredentials('admin', 'password1')).toBe(false);
        expect(auth.verifySessionToken(oldSession)).toBe(false);
    });

    it('keeps the password and sessions when only the username changes', async () => {
        const session = auth.createSessionToken() ?? undefined;
        const res = await post('/', { currentPassword: 'password1', username: 'owner', newPassword: '' });
        expect(res.status).toBe(200);
        expect(auth.verifyCredentials('owner', 'password1')).toBe(true);
        expect(auth.verifySessionToken(session)).toBe(true);
    });

    it('refuses changes while .env sets the login', async () => {
        process.env.MOCKOON_UI_USERNAME = 'env-admin';
        process.env.MOCKOON_UI_PASSWORD = 'env-password';
        const res = await post('/', { currentPassword: 'env-password', username: 'x', newPassword: 'password2' });
        expect(res.status).toBe(409);
    });

    it('runs the setup again only with the full login', async () => {
        expect((await post('/reset', { username: 'admin', password: 'wrong' })).status).toBe(403);
        expect((await post('/reset', { username: 'someone', password: 'password1' })).status).toBe(403);
        expect(settings.isSetupRequired()).toBe(false);

        const res = await post('/reset', { username: 'admin', password: 'password1' });
        expect(res.status).toBe(200);
        expect(settings.isSetupRequired()).toBe(true);
        expect(fs.existsSync(path.join(dir, 'config', 'settings.json'))).toBe(false);
        expect(auth.isAuthConfigured()).toBe(false);
    });
});
