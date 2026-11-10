import fs from 'fs';
import { Environment } from '@/types/mockoon';
import { resolveEnvFile } from '../../lib/data-dir';
import { normalizeEnvironment } from '../../lib/normalize-env';
import { TransferError, findItem, insertItems, removeItem } from '../../lib/route-bundle';

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
 * Copies or moves a route (HTTP, CRUD or WebSocket) or a folder with everything inside it to another environment.
 * Copies get new uuids; data buckets and callbacks the routes use come along unless the target already has them.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { sourceFilename, targetFilename, itemType, itemUuid, mode } = body;
        const targetFolderUuid: string | null = body.targetFolderUuid || null;

        if (mode !== 'copy' && mode !== 'move') {
            return Response.json({ error: 'Mode must be copy or move' }, { status: 400 });
        }
        if ((itemType !== 'route' && itemType !== 'folder') || typeof itemUuid !== 'string' || !itemUuid) {
            return Response.json({ error: 'Missing itemUuid or invalid itemType' }, { status: 400 });
        }
        if (sourceFilename === targetFilename) {
            return Response.json({ error: 'Pick another environment as the target' }, { status: 400 });
        }

        const source = readEnvironment(sourceFilename);
        const target = readEnvironment(targetFilename);
        const root = findItem(source.env, itemType, itemUuid);
        if (!root) {
            return Response.json({ error: `${itemType === 'route' ? 'Route' : 'Folder'} not found` }, { status: 404 });
        }

        const result = insertItems(source.env, [root], target.env, targetFolderUuid);
        if (mode === 'move') removeItem(source.env, root);

        // Target first: if writing the source then fails, the item exists twice instead of nowhere
        fs.writeFileSync(target.path, JSON.stringify(target.env, null, 2), 'utf-8');
        if (mode === 'move') {
            fs.writeFileSync(source.path, JSON.stringify(source.env, null, 2), 'utf-8');
        }

        const { refs, ...counts } = result;
        return Response.json({
            success: true,
            mode,
            itemUuid: refs[0].uuid,
            ...counts,
            source: { ...source.env, filename: sourceFilename },
            target: { ...target.env, filename: targetFilename },
        });
    } catch (error) {
        return errorResponse(error, 'copy or move');
    }
}
