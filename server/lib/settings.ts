import fs from 'fs';
import net from 'net';
import path from 'path';
import { parseArgs } from 'util';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Saved by the first-run setup in config/settings.json (outside data/, which the environment API can read and write). */
export interface Settings {
    /** Absent while the login comes from MOCKOON_UI_USERNAME / MOCKOON_UI_PASSWORD */
    username?: string;
    passwordHash?: string;
    /** Signs session cookies; MOCKOON_UI_AUTH_SECRET overrides it */
    secret: string;
    uiPort: number;
    mockPortRange: { min: number; max: number };
}

export const DEFAULT_UI_PORT = 7001;

const settingsFile = () => path.join(process.cwd(), 'config', 'settings.json');

let cache: Settings | null | undefined;

export function getSettings(): Settings | null {
    if (cache === undefined) {
        try {
            cache = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')) as Settings;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(`Cannot read ${settingsFile()}: ${(error as Error).message}`);
            }
            cache = null;
        }
    }
    return cache;
}

export function saveSettings(settings: Settings) {
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write then rename, so a crash never leaves a half-written file; owner-only because it holds the secret
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, file);
    cache = settings;
}

export function hashPassword(password: string): string {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
    return timingSafeEqual(actual, expected);
}

/** Login from .env; it wins over the saved one, so a forgotten password can be reset by setting these and restarting. */
export function getEnvCredentials(): { username: string; password: string } | null {
    const username = process.env.MOCKOON_UI_USERNAME;
    const password = process.env.MOCKOON_UI_PASSWORD;
    return username && password ? { username, password } : null;
}

export function isSetupRequired(): boolean {
    const settings = getSettings();
    return !settings || (!getEnvCredentials() && !(settings.username && settings.passwordHash));
}

// `--port` (dev script) and PORT (Docker) win over the setup value
const { values: args } = parseArgs({ options: { port: { type: 'string' } }, strict: false });

export function getUiPortSource(): 'arg' | 'env' | 'settings' | 'default' {
    if (Number(args.port)) return 'arg';
    if (Number(process.env.PORT)) return 'env';
    return getSettings()?.uiPort ? 'settings' : 'default';
}

export function getUiPort(): number {
    return Number(args.port) || Number(process.env.PORT) || getSettings()?.uiPort || DEFAULT_UI_PORT;
}

// Not HOSTNAME: Docker sets that to the container id
export const getUiHost = () => process.env.HOST || '0.0.0.0';

export const FIREWALLS = ['ufw', 'firewalld', 'none'] as const;
export type Firewall = (typeof FIREWALLS)[number];

/** Which firewall the setup shows commands for (MOCKOON_FIREWALL). The UI never changes the firewall itself. */
export function getFirewall(): Firewall {
    const value = process.env.MOCKOON_FIREWALL?.trim().toLowerCase() || 'ufw';
    if (!(FIREWALLS as readonly string[]).includes(value)) {
        throw new Error(`Invalid MOCKOON_FIREWALL "${value}", expected one of: ${FIREWALLS.join(', ')}`);
    }
    return value as Firewall;
}

/** Resolves false when something already listens on the port. */
export function isPortFree(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, getUiHost(), () => probe.close(() => resolve(true)));
    });
}

let setupToken: string | undefined;

/** One-time token printed to the server log, so only someone with server access can claim the setup. */
export function getSetupToken(): string {
    setupToken ??= randomBytes(12).toString('hex');
    return setupToken;
}

export function isSetupToken(token: unknown): boolean {
    if (typeof token !== 'string') return false;
    const digest = (value: string) => createHmac('sha256', 'setup').update(value).digest();
    return timingSafeEqual(digest(token.trim()), digest(getSetupToken()));
}
