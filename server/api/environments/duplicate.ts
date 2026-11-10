import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Environment } from '@/types/mockoon';
import { getDataDir, loadEnvironments } from '../../lib/data-dir';
import { findAvailablePort } from '../../lib/port-range';
import { copyName, duplicateItem, findItem, remapUuids } from '../../lib/route-bundle';
import { errorResponse, readEnvironment } from './transfer';

/** `<slug of name>.json`, with -2, -3, ... when taken. */
export function freeFilename(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'environment';
    for (let i = 1; ; i++) {
        const candidate = `${base}${i === 1 ? '' : `-${i}`}.json`;
        if (!fs.existsSync(path.join(getDataDir(), candidate))) return candidate;
    }
}

/**
 * Duplicates an environment as "<name> (copy N)" on the first free port of the range (never the original's,
 * so both can run). Routes, folders and responses get new uuids; data buckets and callbacks are copied.
 * Body: `{ filename }`.
 */
export async function POST(req: Request) {
    try {
        const { filename } = await req.json().catch(() => ({}));
        const { env } = readEnvironment(filename);

        const port = await findAvailablePort(null);
        if (port === null) {
            return Response.json({ error: 'No free port left in the allowed range. Widen it in Account first.' }, { status: 409 });
        }

        const name = copyName(env.name, loadEnvironments().map(e => e.name));
        const tree = remapUuids(env.routes, env.folders, env.rootChildren);
        const duplicate: Environment = {
            ...structuredClone(env),
            uuid: uuidv4(),
            name,
            port,
            routes: tree.routes,
            folders: tree.folders,
            rootChildren: tree.refs,
            // Bucket ids stay: templates refer to them; uuids are per environment
            data: env.data.map(bucket => ({ ...bucket, uuid: uuidv4() })),
        };

        const newFilename = freeFilename(name);
        // 'wx' never overwrites a file created in the meantime
        fs.writeFileSync(path.join(getDataDir(), newFilename), JSON.stringify(duplicate, null, 2), { encoding: 'utf-8', flag: 'wx' });

        return Response.json({ success: true, environment: { ...duplicate, filename: newFilename } });
    } catch (error) {
        return errorResponse(error, 'duplicate the environment');
    }
}

/**
 * Duplicates a route or a folder (with everything in it) inside its environment, right after the original.
 * Body: `{ filename, itemType, itemUuid }`.
 */
export async function POST_ITEM(req: Request) {
    try {
        const { filename, itemType, itemUuid } = await req.json().catch(() => ({}));
        const { path: filePath, env } = readEnvironment(filename);
        const root = findItem(env, itemType, itemUuid);
        if (!root) return Response.json({ error: 'Route or folder not found' }, { status: 404 });

        const ref = duplicateItem(env, root);
        fs.writeFileSync(filePath, JSON.stringify(env, null, 2), 'utf-8');

        return Response.json({ success: true, itemUuid: ref.uuid, target: { ...env, filename } });
    } catch (error) {
        return errorResponse(error, 'duplicate');
    }
}
