import { loadEnvironments } from './data-dir';
import { getSettings, getUiPort } from './settings';

export interface PortRange {
    min: number;
    max: number;
}

/**
 * Ports mock servers may listen on: MOCKOON_PORT_RANGE (e.g. "7002-7020"), else the range saved by the
 * setup, else any port. Open the same range once in the firewall (`sudo ufw allow 7002:7020/tcp`);
 * a port with no server running just refuses connections.
 */
export function getPortRange(): PortRange {
    const raw = process.env.MOCKOON_PORT_RANGE?.trim();
    if (!raw) return getSettings()?.mockPortRange ?? { min: 1, max: 65535 };

    const match = /^(\d{1,5})\s*[-:]\s*(\d{1,5})$/.exec(raw);
    const min = Number(match?.[1]);
    const max = Number(match?.[2]);
    if (!match || min < 1 || max > 65535 || min > max) {
        throw new Error(`Invalid MOCKOON_PORT_RANGE "${raw}", expected e.g. 7002-7020`);
    }
    return { min, max };
}

/**
 * Returns an error message, or null when the port is inside the range and not assigned to another
 * environment. `excludeFilename` is the environment being edited or started, so it does not clash with itself.
 */
export function checkPort(port: unknown, excludeFilename?: string): string | null {
    const { min, max } = getPortRange();
    if (typeof port !== 'number' || !Number.isInteger(port) || port < min || port > max) {
        return `Valid port number is required (${min}-${max})`;
    }
    if (port === getUiPort()) {
        return `Port ${port} is used by Mockoon UI`;
    }
    const owner = loadEnvironments().find(env => env.port === port && env.filename !== excludeFilename);
    return owner ? `Port ${port} is already used by environment "${owner.name}"` : null;
}

/** Keeps an imported environment's port when usable, otherwise picks a free one; null when the range is full. */
export function portForImport(port: unknown): number | null {
    return checkPort(port) === null ? (port as number) : findFreePort();
}

/** First port in the range not assigned to any environment, or null when the range is full. */
export function findFreePort(): number | null {
    const { min, max } = getPortRange();
    const used = new Set([getUiPort(), ...loadEnvironments().map(env => env.port)]);
    for (let port = min; port <= max; port++) {
        if (!used.has(port)) return port;
    }
    return null;
}
