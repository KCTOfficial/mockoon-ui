import fs from 'fs';
import { collect, findItems, removeItem } from '../../lib/route-bundle';
import { trashItem } from '../../lib/route-trash';
import { errorResponse, readEnvironment } from './transfer';

/**
 * Bulk delete: puts routes and folders (each folder with everything in it) in the recycle bin, one entry per
 * item so each can be restored on its own, then removes them from the environment.
 * Body: `{ filename, items: [{ type, uuid }] }`. Items inside a listed folder go with that folder.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { path: filePath, env } = readEnvironment(body.filename);
        const roots = findItems(env, body.items);
        const { routes, folders } = collect(env, roots);

        // Recycle bin first: if saving the environment then fails, the items exist twice instead of nowhere
        const trashIds = roots.map(root => trashItem(env, root, body.filename));
        roots.forEach(root => removeItem(env, root));
        fs.writeFileSync(filePath, JSON.stringify(env, null, 2), 'utf-8');

        return Response.json({
            success: true,
            routeCount: routes.length,
            folderCount: folders.length,
            routeUuids: routes.map(r => r.uuid),
            trashIds,
            target: { ...env, filename: body.filename },
        });
    } catch (error) {
        return errorResponse(error, 'delete');
    }
}
