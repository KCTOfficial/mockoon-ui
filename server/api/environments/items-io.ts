import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HighestMigrationId } from '@mockoon/commons';
import { getDataDir } from '../../lib/data-dir';
import { normalizeEnvironment } from '../../lib/normalize-env';
import { findAvailablePort } from '../../lib/port-range';
import { TransferError, buildBundle, bundleFilename, findItem, insertItems, parseBundle } from '../../lib/route-bundle';
import { freeFilename } from './duplicate';
import { errorResponse, readEnvironment } from './transfer';

/** Largest file accepted by the routes import (an export is usually a few KB). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 100;

/**
 * Export: downloads a route or a folder (with its subtree, data buckets and callbacks) as
 * `<environment>-<item>.json`. Query: `filename`, `itemType` (route | folder), `itemUuid`.
 */
export async function GET(req: Request) {
    try {
        const params = new URL(req.url).searchParams;
        const { env } = readEnvironment(params.get('filename'));
        const root = findItem(env, params.get('itemType'), params.get('itemUuid'));
        if (!root) return Response.json({ error: 'Route or folder not found' }, { status: 404 });

        const name = bundleFilename(env, root);
        return new Response(JSON.stringify(buildBundle(env, root), null, 2), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                // The name only has [a-z0-9-.] (see bundleFilename), so it needs no further quoting
                'Content-Disposition': `attachment; filename="${name}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        return errorResponse(error, 'export');
    }
}

/** A new, empty environment on the first free port of the range; not written yet. */
async function newEnvironment(rawName: string) {
    const name = rawName.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
        throw new TransferError(`Environment name must be 1-${MAX_NAME_LENGTH} characters`, 400);
    }
    const port = await findAvailablePort(null);
    if (port === null) throw new TransferError('No free port left in the allowed range. Widen it in Account first.', 409);
    const filename = freeFilename(name);
    const env = normalizeEnvironment({
        uuid: uuidv4(), lastMigration: HighestMigrationId, name, port,
        routes: [], folders: [], rootChildren: [], data: [], callbacks: [],
    });
    return { filename, path: path.join(getDataDir(), filename), env };
}

/**
 * Import: adds the routes and folders of an uploaded file (from Export, or a whole Mockoon environment) to an
 * existing environment, or to a new one. Multipart fields: `file`, then either `filename` (+ `targetFolderUuid`)
 * for an existing environment, or `newEnvironmentName` to create one.
 */
export async function POST(req: Request) {
    try {
        const form = await req.formData().catch(() => null);
        const file = form?.get('file');
        if (!form || !(file instanceof File)) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.size > MAX_IMPORT_BYTES) {
            return Response.json({ error: 'The file is larger than 10 MB' }, { status: 413 });
        }

        let content: unknown;
        try {
            content = JSON.parse(await file.text());
        } catch {
            return Response.json({ error: 'The file is not valid JSON' }, { status: 400 });
        }
        // Validate the file before touching (or creating) any environment
        const { env: source, roots, kind } = parseBundle(content);

        const newName = form.get('newEnvironmentName');
        const created = typeof newName === 'string';
        const target = created ? await newEnvironment(newName) : { ...readEnvironment(form.get('filename')), filename: form.get('filename') as string };
        const folderField = form.get('targetFolderUuid');
        const folderUuid = !created && typeof folderField === 'string' && folderField ? folderField : null;

        const result = insertItems(source, roots, target.env, folderUuid);
        // A new file must not replace one created meanwhile
        fs.writeFileSync(target.path, JSON.stringify(target.env, null, 2), { encoding: 'utf-8', flag: created ? 'wx' : 'w' });

        const { refs, ...counts } = result;
        return Response.json({
            success: true,
            kind,
            created,
            itemUuids: refs.map(r => r.uuid),
            ...counts,
            target: { ...target.env, filename: target.filename },
        });
    } catch (error) {
        return errorResponse(error, 'import');
    }
}
