import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import { isSetupRequired } from './lib/settings';
import {
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    createSessionToken,
    isAuthConfigured,
    verifyCredentials,
    verifySessionToken,
} from '@/lib/auth';

const FAILED_LOGIN_DELAY_MS = 800;

// Guards the management API. Mock servers run on separate ports and are not routed through here.
export const requireSession: MiddlewareHandler = async (c, next) => {
    if (!verifySessionToken(getCookie(c, SESSION_COOKIE))) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
};

export const authRoutes = new Hono();

authRoutes.get('/session', (c) =>
    c.json({
        authenticated: verifySessionToken(getCookie(c, SESSION_COOKIE)),
        configured: isAuthConfigured(),
        setupRequired: isSetupRequired(),
    })
);

authRoutes.post('/login', async (c) => {
    if (!isAuthConfigured()) {
        return c.json({ error: 'Login is not configured on the server.' }, 503);
    }

    const body = await c.req.json().catch(() => ({}));
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!verifyCredentials(username, password)) {
        // Slow down brute-force attempts
        await new Promise(resolve => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
        return c.json({ error: 'Invalid username or password.' }, 401);
    }

    if (!startSession(c)) {
        return c.json({ error: 'Login is not configured on the server.' }, 503);
    }

    return c.json({ success: true });
});

/** Sets the session cookie; false when login is not configured. */
export function startSession(c: Context): boolean {
    const token = createSessionToken();
    if (!token) return false;

    // Only mark Secure when served over HTTPS (directly or behind a TLS-terminating proxy), so plain-HTTP LAN setups still work
    const isHttps = c.req.header('x-forwarded-proto') === 'https' || process.env.MOCKOON_UI_COOKIE_SECURE === 'true';

    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: isHttps,
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return true;
}

authRoutes.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ success: true });
});
