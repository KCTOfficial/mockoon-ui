import { randomBytes } from 'crypto';
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { startSession } from './auth';
import { clearSettings, getEnvCredentials, getSettings, hashPassword, logSetupRequired, saveSettings } from './lib/settings';
import { SESSION_COOKIE, getLoginUsername, verifyCredentials, verifyCurrentPassword } from '@/lib/auth';

const FAILED_PASSWORD_DELAY_MS = 800;

const ENV_MANAGED_ERROR =
    'The login is set by MOCKOON_UI_USERNAME and MOCKOON_UI_PASSWORD in .env. Remove them and restart to manage it here.';

/** Change the dashboard login (behind requireSession). .env credentials, when set, cannot be changed here. */
export const accountRoutes = new Hono();

accountRoutes.get('/', (c) =>
    c.json({
        username: getLoginUsername(),
        managedByEnv: !!getEnvCredentials(),
    })
);

accountRoutes.post('/', async (c) => {
    const settings = getSettings();
    if (getEnvCredentials() || !settings) {
        return c.json({ error: ENV_MANAGED_ERROR }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!verifyCurrentPassword(currentPassword)) {
        // Slow down guessing from a stolen session
        await new Promise(resolve => setTimeout(resolve, FAILED_PASSWORD_DELAY_MS));
        return c.json({ error: 'Current password is incorrect.' }, 403);
    }
    if (username.length < 1 || username.length > 64) {
        return c.json({ error: 'Username must be 1-64 characters.' }, 400);
    }
    // Empty new password keeps the current one
    if (newPassword && (newPassword.length < 8 || newPassword.length > 256)) {
        return c.json({ error: 'New password must be at least 8 characters.' }, 400);
    }

    saveSettings({
        ...settings,
        username,
        passwordHash: newPassword ? hashPassword(newPassword) : settings.passwordHash,
        // A new password signs out every other session (unless MOCKOON_UI_AUTH_SECRET pins the secret)
        secret: newPassword ? randomBytes(32).toString('base64url') : settings.secret,
    });

    // Keep this browser signed in with the (possibly new) secret
    startSession(c);
    return c.json({ success: true, username });
});

/** Runs the first-run setup again; confirmed with the full login, not just the session. */
accountRoutes.post('/reset', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!verifyCredentials(username, password)) {
        await new Promise(resolve => setTimeout(resolve, FAILED_PASSWORD_DELAY_MS));
        return c.json({ error: 'Username or password is incorrect.' }, 403);
    }

    clearSettings();
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    console.log('Setup reset from the UI.');
    logSetupRequired();
    return c.json({ success: true });
});
