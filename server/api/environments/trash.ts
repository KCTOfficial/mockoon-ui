import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Environment } from '@/types/mockoon';
import { getDataDir, getTrashDir, loadEnvironments, resolveEnvFile } from '../../lib/data-dir';
import { normalizeEnvironment } from '../../lib/normalize-env';
import { findAvailablePort } from '../../lib/port-range';
import { BUNDLE_MARKER, TransferError, describeRoute, insertItems, parseBundle } from '../../lib/route-bundle';
import type { DeletedFrom } from '../../lib/route-trash';
import { errorResponse, readEnvironment } from './transfer';

/** `<original name>-<ISO time with : and . replaced by ->.json`, as written by delete.ts */
const TRASH_NAME = /^(.+)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

export interface TrashItem {
    /** File name inside data/.deleted/, used as the id for restore and delete */
    id: string;
    /** A whole environment, or a route / folder deleted from one */
    kind: 'environment' | 'route' | 'folder';
    /** Environment name, "GET /users" or the folder name */
    name: string;
    /** For a route or folder: the environment (and folder) it was deleted from */
    deletedFrom?: DeletedFrom;
    /** For a route or folder: that environment no longer exists, so restoring needs another target */
    sourceMissing?: boolean;
    port: number | null;
    /** File name it had in data/ before it was deleted */
    originalFilename: string;
    deletedAt: string;
    routeCount: number;
    /** The file cannot be read as an environment; it can only be deleted */
    invalid: boolean;
}

/** Path of a recycle bin entry, or null for anything that is not a plain .json file name in data/.deleted/. */
function resolveTrashFile(id: unknown): string | null {
    if (typeof id !== 'string' || path.basename(id) !== id || !id.endsWith('.json') || id.startsWith('.')) {
        return null;
    }
    const file = path.join(getTrashDir(), id);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function describeItem(id: string): TrashItem {
    const file = path.join(getTrashDir(), id);
    const match = TRASH_NAME.exec(id);
    const originalFilename = match ? `${match[1]}.json` : id;
    const deletedAt = match
        ? new Date(`${match[2]}T${match[3]}:${match[4]}:${match[5]}.${match[6]}Z`).toISOString()
        : fs.statSync(file).mtime.toISOString();

    try {
        const env = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (env?.type === BUNDLE_MARKER && env.deletedFrom && Array.isArray(env.routes) && Array.isArray(env.rootChildren)) {
            const root = env.rootChildren[0];
            const kind: TrashItem['kind'] = root?.type === 'folder' ? 'folder' : 'route';
            const route = env.routes.find((r: { uuid: string }) => r.uuid === root?.uuid);
            const folder = (env.folders ?? []).find((f: { uuid: string }) => f.uuid === root?.uuid);
            return {
                id,
                kind,
                name: kind === 'route' ? (route ? describeRoute(route) : 'Route') : folder?.name ?? 'Folder',
                deletedFrom: env.deletedFrom,
                sourceMissing: !environmentExists(env.deletedFrom.filename),
                port: null,
                originalFilename: env.deletedFrom.filename,
                deletedAt: typeof env.exportedAt === 'string' ? env.exportedAt : deletedAt,
                routeCount: env.routes.length,
                invalid: false,
            };
        }
        if (!env || typeof env !== 'object' || typeof env.name !== 'string' || !Array.isArray(env.routes)) {
            throw new Error('Not an environment');
        }
        return {
            id,
            kind: 'environment',
            name: env.name,
            port: typeof env.port === 'number' ? env.port : null,
            originalFilename,
            deletedAt,
            routeCount: env.routes.length,
            invalid: false,
        };
    } catch {
        return { id, kind: 'environment', name: originalFilename.replace(/\.json$/, ''), port: null, originalFilename, deletedAt, routeCount: 0, invalid: true };
    }
}

export function listTrash(): TrashItem[] {
    const dir = getTrashDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json') && !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile())
        .map(describeItem)
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** The original file name when free in data/, else `<name>-restored.json`, `<name>-restored-2.json`, ... */
function freeFilename(original: string): string {
    const base = original.replace(/\.json$/, '');
    const taken = (name: string) => fs.existsSync(path.join(getDataDir(), name));
    if (!taken(original)) return original;
    for (let i = 1; ; i++) {
        const candidate = `${base}-restored${i === 1 ? '' : `-${i}`}.json`;
        if (!taken(candidate)) return candidate;
    }
}

function environmentExists(filename: unknown): boolean {
    const filePath = resolveEnvFile(filename);
    return !!filePath && fs.existsSync(filePath);
}

/**
 * Puts a deleted route or folder back: into its environment and folder (top level when the folder is gone), or,
 * when `chosen` is given (e.g. its environment was deleted), into that environment and folder instead.
 */
async function restoreItem(file: string, item: TrashItem, from: DeletedFrom, chosen?: { filename: unknown; folderUuid: unknown }) {
    try {
        const targetFilename = chosen?.filename ?? from.filename;
        if (!environmentExists(targetFilename)) {
            throw chosen
                ? new TransferError('Environment not found', 404)
                : new TransferError(`"${from.envName}" no longer exists. Choose another environment to restore into.`, 409);
        }
        const target = readEnvironment(targetFilename);
        const { env: source, roots } = parseBundle(JSON.parse(fs.readFileSync(file, 'utf-8')));
        const wanted = chosen ? (typeof chosen.folderUuid === 'string' && chosen.folderUuid ? chosen.folderUuid : null) : from.folderUuid;
        if (chosen && wanted && !target.env.folders.some(f => f.uuid === wanted)) {
            throw new TransferError('Target folder not found', 404);
        }
        const folderUuid = wanted && target.env.folders.some(f => f.uuid === wanted) ? wanted : null;
        const result = insertItems(source, roots, target.env, folderUuid);

        fs.writeFileSync(target.path, JSON.stringify(target.env, null, 2), 'utf-8');
        fs.rmSync(file, { force: true });

        const { refs, ...counts } = result;
        return Response.json({
            success: true,
            kind: item.kind,
            name: item.name,
            itemUuids: refs.map(r => r.uuid),
            // The folder it was in may have been deleted meanwhile
            restoredToFolder: chosen ? true : folderUuid !== null,
            ...counts,
            target: { ...target.env, filename: targetFilename },
        });
    } catch (error) {
        return errorResponse(error, 'restore');
    }
}

/** Lists the recycle bin (data/.deleted/), newest first. */
export async function GET() {
    try {
        return Response.json({ items: listTrash() });
    } catch (error) {
        console.error('API Error reading recycle bin:', error);
        return Response.json({ error: 'Failed to read the recycle bin' }, { status: 500 });
    }
}

/** `{ action: 'restore' | 'delete', id }` or `{ action: 'empty' }`. */
export async function POST(req: Request) {
    try {
        const { action, id, targetFilename, targetFolderUuid } = await req.json().catch(() => ({}));

        if (action === 'empty') {
            const items = listTrash();
            items.forEach(item => fs.rmSync(path.join(getTrashDir(), item.id), { force: true }));
            return Response.json({ success: true, deleted: items.length });
        }

        const file = resolveTrashFile(id);
        if (!file) {
            return Response.json({ error: 'Item not found in the recycle bin' }, { status: 404 });
        }

        if (action === 'delete') {
            fs.rmSync(file, { force: true });
            return Response.json({ success: true });
        }

        if (action === 'restore') {
            const item = describeItem(id);
            if (item.kind !== 'environment' && item.deletedFrom) {
                return restoreItem(file, item, item.deletedFrom,
                    targetFilename ? { filename: targetFilename, folderUuid: targetFolderUuid } : undefined);
            }
            if (item.invalid) {
                return Response.json({ error: 'This file is not a valid environment and cannot be restored' }, { status: 400 });
            }
            const environment = JSON.parse(fs.readFileSync(file, 'utf-8')) as Environment;

            // Its old port may meanwhile be taken by another environment, the UI or another program, or be outside the range
            const previousPort = item.port;
            const port = await findAvailablePort(previousPort);
            if (port === null) {
                return Response.json({ error: 'No free port left in the allowed range. Widen it in Account first.' }, { status: 409 });
            }
            environment.port = port;

            // The UI tells environments apart by uuid; an environment imported again since the delete may share it
            if (loadEnvironments().some(env => env.uuid === environment.uuid)) {
                environment.uuid = uuidv4();
            }

            const filename = freeFilename(item.originalFilename);
            // 'wx' fails instead of overwriting if the name was taken in the meantime
            fs.writeFileSync(path.join(getDataDir(), filename), JSON.stringify(environment, null, 2), { encoding: 'utf-8', flag: 'wx' });
            fs.rmSync(file, { force: true });

            let restored: Environment = environment;
            try {
                restored = normalizeEnvironment(JSON.parse(JSON.stringify(environment)));
            } catch {
                // Same as loadEnvironments: show the raw file if it cannot be migrated
            }

            return Response.json({
                success: true,
                environment: { ...restored, filename },
                previousPort,
                portChanged: previousPort !== port,
            });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('API Error managing recycle bin:', error);
        return Response.json({ error: 'Failed to update the recycle bin' }, { status: 500 });
    }
}
