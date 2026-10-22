import fs from 'fs';
import path from 'path';
import { Environment } from '@/types/mockoon';
import { normalizeEnvironment } from './normalize-env';

export const getDataDir = () => path.join(process.cwd(), 'data');

/**
 * Resolves an environment filename inside data/. Returns null for anything that is not a plain
 * `<name>.json` file name, so request input can never escape the data directory.
 */
export function resolveEnvFile(filename: unknown): string | null {
    if (typeof filename !== 'string' || path.basename(filename) !== filename || path.extname(filename) !== '.json') {
        return null;
    }
    return path.join(getDataDir(), filename);
}

/** Loads every valid Mockoon environment from data/, tagging each with its (virtual) filename. */
export function loadEnvironments(): Environment[] {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) return [];

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    return files.map(file => {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const parsed = JSON.parse(content);
            // Only load files that have the Mockoon environment structure
            if (parsed.uuid && parsed.name && parsed.routes !== undefined) {
                // Normalized copy for the UI only (files saved by older versions may lack e.g. tlsOptions)
                let env: Environment = parsed;
                try {
                    env = normalizeEnvironment(parsed);
                } catch {
                    // Keep the raw file content if it cannot be migrated
                }
                return { ...env, filename: file } as Environment;
            }
            return null;
        } catch {
            return null;
        }
    }).filter((env): env is Environment => env !== null);
}
