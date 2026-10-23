import { randomBytes } from 'crypto';
import { Hono } from 'hono';
import { startSession } from './auth';
import { getPortRange } from './lib/port-range';
import {
    getEnvCredentials,
    getFirewall,
    getSettings,
    getUiPort,
    getUiPortSource,
    hashPassword,
    isPortFree,
    isSetupRequired,
    saveSettings,
} from './lib/settings';

const isPort = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;

interface SetupServer {
    /** Port the UI is listening on right now */
    currentPort: () => number;
    /** Starts listening on the new port and closes the old one */
    moveTo: (port: number) => void;
}

/**
 * First-run setup: login, UI port and mock server port range. Open to whoever reaches the UI first and
 * locked once saved (409), so it should be completed right after the first start.
 */
export function createSetupRoutes(server: SetupServer) {
    const routes = new Hono();

    routes.get('/', (c) => {
        if (!isSetupRequired()) return c.json({ required: false });
        const uiPortSource = getUiPortSource();
        return c.json({
            required: true,
            needsCredentials: !getEnvCredentials(),
            uiPort: { value: getUiPort(), locked: uiPortSource === 'arg' || uiPortSource === 'env' },
            mockPortRange: { ...getPortRange(), locked: !!process.env.MOCKOON_PORT_RANGE?.trim() },
            firewall: getFirewall(),
        });
    });

    routes.post('/', async (c) => {
        if (!isSetupRequired()) {
            return c.json({ error: 'Setup is already done.' }, 409);
        }

        const body = await c.req.json().catch(() => ({}));

        const needsCredentials = !getEnvCredentials();
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (needsCredentials && (username.length < 1 || username.length > 64)) {
            return c.json({ error: 'Username must be 1-64 characters.' }, 400);
        }
        if (needsCredentials && (password.length < 8 || password.length > 256)) {
            return c.json({ error: 'Password must be at least 8 characters.' }, 400);
        }

        // Values set by --port / PORT / MOCKOON_PORT_RANGE are locked and ignored here
        const uiPortSource = getUiPortSource();
        const uiPort = uiPortSource === 'arg' || uiPortSource === 'env' ? getUiPort() : body.uiPort;
        const range = process.env.MOCKOON_PORT_RANGE?.trim()
            ? getPortRange()
            : { min: body.mockPortMin, max: body.mockPortMax };

        if (!isPort(uiPort)) {
            return c.json({ error: 'UI port must be between 1 and 65535.' }, 400);
        }
        if (!isPort(range.min) || !isPort(range.max) || range.min > range.max) {
            return c.json({ error: 'Mock server port range is invalid (from must be ≤ to, both 1-65535).' }, 400);
        }
        if (uiPort >= range.min && uiPort <= range.max) {
            return c.json({ error: `UI port ${uiPort} must be outside the mock server range ${range.min}-${range.max}.` }, 400);
        }

        const moved = uiPort !== server.currentPort();
        if (moved && !(await isPortFree(uiPort))) {
            return c.json({ error: `Port ${uiPort} is already in use.` }, 400);
        }

        const previous = getSettings();
        saveSettings({
            ...(needsCredentials
                ? { username, passwordHash: hashPassword(password) }
                : { username: previous?.username, passwordHash: previous?.passwordHash }),
            secret: previous?.secret || randomBytes(32).toString('base64url'),
            uiPort,
            mockPortRange: { min: range.min, max: range.max },
        });

        // Signed in right away; the cookie is per host, so it also works on the new port
        startSession(c);

        if (moved) {
            // Let this response go out on the current port first
            setTimeout(() => server.moveTo(uiPort), 300);
        }
        return c.json({ success: true, uiPort, moved });
    });

    return routes;
}
