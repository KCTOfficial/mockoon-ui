import { createHmac, timingSafeEqual } from 'crypto';

// Static-credential auth for the dashboard UI only. Mock servers (PM2 processes on their own ports) are not affected.
export const SESSION_COOKIE = 'mockoon_ui_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getConfig() {
    const username = process.env.MOCKOON_UI_USERNAME;
    const password = process.env.MOCKOON_UI_PASSWORD;
    const secret = process.env.MOCKOON_UI_AUTH_SECRET;
    if (!username || !password || !secret) return null;
    return { username, password, secret };
}

export function isAuthConfigured(): boolean {
    return getConfig() !== null;
}

function safeEqual(a: string, b: string): boolean {
    // Hash both sides so lengths match and comparison time doesn't leak input length
    const ha = createHmac('sha256', 'cmp').update(a).digest();
    const hb = createHmac('sha256', 'cmp').update(b).digest();
    return timingSafeEqual(ha, hb);
}

export function verifyCredentials(username: string, password: string): boolean {
    const config = getConfig();
    if (!config) return false;
    // Evaluate both to avoid short-circuit timing differences
    const userOk = safeEqual(username, config.username);
    const passOk = safeEqual(password, config.password);
    return userOk && passOk;
}

function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Token format: `<expiresAtMs>.<hmac>` */
export function createSessionToken(): string | null {
    const config = getConfig();
    if (!config) return null;
    const payload = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    return `${payload}.${sign(payload, config.secret)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
    const config = getConfig();
    if (!config || !token) return false;

    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);

    if (!safeEqual(signature, sign(payload, config.secret))) return false;

    const expiresAt = Number(payload);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/** Only allow same-origin relative paths to prevent open redirects. */
export function sanitizeNextPath(next: unknown): string {
    if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
        return '/';
    }
    return next;
}
