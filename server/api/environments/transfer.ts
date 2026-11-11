import fs from 'fs';
import { Environment, FolderChild } from '@/types/mockoon';
import { resolveEnvFile } from '../../lib/data-dir';
import { normalizeEnvironment } from '../../lib/normalize-env';
import {
    TransferError, collect, findItem, findItems, insertItems, isInsideFolder, prepareDestination, relocateItems, removeItem,
} from '../../lib/route-bundle';

/** Reads an environment file in the current Mockoon format, so routes from an older file fit a newer one. */
export function readEnvironment(filename: unknown): { path: string; env: Environment } {
    const filePath = resolveEnvFile(filename);
    if (!filePath || !fs.existsSync(filePath)) throw new TransferError('Environment not found', 404);
    try {
        return { path: filePath, env: normalizeEnvironment(JSON.parse(fs.readFileSync(filePath, 'utf-8'))) };
    } catch (error) {
        throw new TransferError(error instanceof Error ? error.message : 'Invalid environment', 400);
    }
}

export const errorResponse = (error: unknown, context: string) => {
    if (error instanceof TransferError) return Response.json({ error: error.message }, { status: error.status });
    console.error(`API Error ${context}:`, error);
    return Response.json({ error: `Failed to ${context}` }, { status: 500 });
};

/**
 * Copies or moves routes (HTTP, CRUD or WebSocket) and folders with everything inside them, to another
 * environment or to another folder of the same one. Body: `sourceFilename`, `targetFilename`, `mode`
 * (copy | move), the items as `items: [{ type, uuid }]` (or one as `itemType` + `itemUuid`), and where they go:
 * `targetFolderUuid` (none: top level), plus `newFolderName` to create a folder there and put them in it.
 * Copies get new uuids; data buckets and callbacks the routes use come along unless the target already has them.
 * A copy inside the same environment gets "-copy-N" on paths that are taken; a move there keeps the uuids.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { sourceFilename, targetFilename, itemType, itemUuid, mode, newFolderName } = body;
        const targetFolderUuid: string | null = typeof body.targetFolderUuid === 'string' && body.targetFolderUuid ? body.targetFolderUuid : null;

        if (mode !== 'copy' && mode !== 'move') {
            return Response.json({ error: 'Mode must be copy or move' }, { status: 400 });
        }
        const bulk = body.items !== undefined;
        if (!bulk && ((itemType !== 'route' && itemType !== 'folder') || typeof itemUuid !== 'string' || !itemUuid)) {
            return Response.json({ error: 'Missing itemUuid or invalid itemType' }, { status: 400 });
        }

        const source = readEnvironment(sourceFilename);
        const sameEnvironment = resolveEnvFile(targetFilename) === source.path;
        // One object for both when they are the same file, so the single write holds every change
        const target = sameEnvironment ? source : readEnvironment(targetFilename);

        let roots: FolderChild[];
        if (bulk) {
            roots = findItems(source.env, body.items);
        } else {
            const root = findItem(source.env, itemType, itemUuid);
            if (!root) {
                return Response.json({ error: `${itemType === 'route' ? 'Route' : 'Folder'} not found` }, { status: 404 });
            }
            roots = [root];
        }
        const moved = collect(source.env, roots);

        if (sameEnvironment && mode === 'move') {
            // Checked before a new folder is made, so a refused move changes nothing
            if (targetFolderUuid && roots.some(root => root.type === 'folder' && isInsideFolder(source.env, root.uuid, targetFolderUuid))) {
                return Response.json({ error: 'A folder cannot be moved into itself' }, { status: 400 });
            }
            const destination = prepareDestination(source.env, targetFolderUuid, newFolderName);
            relocateItems(source.env, roots, destination);
            fs.writeFileSync(source.path, JSON.stringify(source.env, null, 2), 'utf-8');
            const saved = { ...source.env, filename: sourceFilename };
            return Response.json({
                success: true,
                mode,
                itemUuid: roots[0].uuid,
                itemUuids: roots.map(r => r.uuid),
                folderUuid: destination,
                routeCount: moved.routes.length,
                folderCount: moved.folders.length,
                bucketCount: 0,
                callbackCount: 0,
                warnings: [],
                source: saved,
                target: saved,
            });
        }

        const destination = prepareDestination(target.env, targetFolderUuid, newFolderName);
        // A copy reads from a snapshot, so it never walks into what it is adding
        const from = sameEnvironment ? structuredClone(source.env) : source.env;
        const result = insertItems(from, roots, target.env, destination, { renameConflicts: sameEnvironment });
        if (mode === 'move') roots.forEach(root => removeItem(source.env, root));

        // Target first: if writing the source then fails, the items exist twice instead of nowhere
        fs.writeFileSync(target.path, JSON.stringify(target.env, null, 2), 'utf-8');
        if (mode === 'move') {
            fs.writeFileSync(source.path, JSON.stringify(source.env, null, 2), 'utf-8');
        }

        const { refs, ...counts } = result;
        return Response.json({
            success: true,
            mode,
            itemUuid: refs[0].uuid,
            itemUuids: refs.map(r => r.uuid),
            folderUuid: destination,
            ...counts,
            source: { ...source.env, filename: sourceFilename },
            target: { ...target.env, filename: targetFilename },
        });
    } catch (error) {
        return errorResponse(error, 'copy or move');
    }
}
