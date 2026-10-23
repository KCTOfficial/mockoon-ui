/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

type SettingsModule = typeof import('@/server/lib/settings');
type AuthModule = typeof import('@/lib/auth');

const ENV_KEYS = ['MOCKOON_UI_USERNAME', 'MOCKOON_UI_PASSWORD', 'MOCKOON_UI_AUTH_SECRET', 'PORT', 'MOCKOON_FIREWALL'];

describe('settings', () => {
    let dir: string;
    const savedEnv: Record<string, string | undefined> = {};

    // Fresh modules per test: settings caches the file content
    const load = async () => {
        let settings!: SettingsModule;
        let auth!: AuthModule;
        await jest.isolateModulesAsync(async () => {
            settings = await import('@/server/lib/settings');
            auth = await import('@/lib/auth');
        });
        return { settings, auth };
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockoon-settings-'));
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        ENV_KEYS.forEach(key => {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
        ENV_KEYS.forEach(key => {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        });
    });

    it('hashes passwords and verifies them', async () => {
        const { settings } = await load();
        const hash = settings.hashPassword('s3cret-pass');
        expect(hash).not.toContain('s3cret-pass');
        expect(settings.verifyPassword('s3cret-pass', hash)).toBe(true);
        expect(settings.verifyPassword('wrong-pass', hash)).toBe(false);
        expect(settings.verifyPassword('s3cret-pass', 'garbage')).toBe(false);
    });

    it('requires setup until settings are saved, then uses the saved login and port', async () => {
        const { settings, auth } = await load();
        expect(settings.isSetupRequired()).toBe(true);
        expect(auth.isAuthConfigured()).toBe(false);
        expect(settings.getUiPort()).toBe(7001);

        settings.saveSettings({
            username: 'admin',
            passwordHash: settings.hashPassword('password1'),
            secret: 'secret',
            uiPort: 7100,
            mockPortRange: { min: 7002, max: 7020 },
        });

        // Survives a restart (fresh module reads the file)
        const reloaded = await load();
        expect(reloaded.settings.isSetupRequired()).toBe(false);
        expect(reloaded.settings.getUiPort()).toBe(7100);
        expect(reloaded.auth.verifyCredentials('admin', 'password1')).toBe(true);
        expect(reloaded.auth.verifyCredentials('admin', 'wrong')).toBe(false);
        expect(reloaded.auth.verifySessionToken(reloaded.auth.createSessionToken() ?? undefined)).toBe(true);
    });

    it('lets .env credentials and PORT override the saved ones', async () => {
        const { settings } = await load();
        settings.saveSettings({
            username: 'admin',
            passwordHash: settings.hashPassword('password1'),
            secret: 'secret',
            uiPort: 7100,
            mockPortRange: { min: 7002, max: 7020 },
        });
        process.env.MOCKOON_UI_USERNAME = 'reset';
        process.env.MOCKOON_UI_PASSWORD = 'new-password';
        process.env.PORT = '3000';

        const { settings: s, auth } = await load();
        expect(auth.verifyCredentials('reset', 'new-password')).toBe(true);
        expect(auth.verifyCredentials('admin', 'password1')).toBe(false);
        expect(s.getUiPort()).toBe(3000);
        expect(s.getUiPortSource()).toBe('env');
    });

    it('reads MOCKOON_FIREWALL, defaulting to the OS firewall', async () => {
        const { settings } = await load();
        const expected = process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'ufw' : 'none';
        expect(settings.getFirewall()).toBe(expected);
        process.env.MOCKOON_FIREWALL = 'FirewallD';
        expect(settings.getFirewall()).toBe('firewalld');
        process.env.MOCKOON_FIREWALL = 'iptables';
        expect(() => settings.getFirewall()).toThrow('Invalid MOCKOON_FIREWALL');
    });
});
