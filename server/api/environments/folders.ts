import fs from 'fs';
import { Environment, Folder, FolderChild } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';
import { resolveEnvFile } from '../../lib/data-dir';

const MAX_NAME_LENGTH = 100;

const cleanName = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
};

/** The list holding `uuid` (root or a folder's children), or null when it is not in the tree. */
function findContainer(environment: Environment, uuid: string): FolderChild[] | null {
    if (environment.rootChildren.some(c => c.uuid === uuid)) return environment.rootChildren;
    return environment.folders.find(f => f.children.some(c => c.uuid === uuid))?.children ?? null;
}

/** True when `candidate` is `folderUuid` or nested anywhere inside it. */
function isSelfOrDescendant(environment: Environment, folderUuid: string, candidate: string): boolean {
    if (folderUuid === candidate) return true;
    const folder = environment.folders.find(f => f.uuid === folderUuid);
    return !!folder?.children.some(c => c.type === 'folder' && isSelfOrDescendant(environment, c.uuid, candidate));
}

/** Folders and the route/folder tree; returned by every action so the UI can replace its copy. */
const hierarchy = (environment: Environment) => ({
    folders: environment.folders,
    rootChildren: environment.rootChildren,
});

export async function POST(req: Request) {
    try {
        const { filename, action, folder, folderUuid, parentFolderUuid, itemUuid, itemType, targetFolderUuid } = await req.json();

        if (!filename) {
            return Response.json({ error: 'Missing filename' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const environment = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Environment;
        environment.folders ??= [];
        environment.rootChildren ??= [];
        const save = () => fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');

        if (action === 'create') {
            const name = folder?.name === undefined ? 'New folder' : cleanName(folder.name);
            if (!name) return Response.json({ error: `Folder name must be 1-${MAX_NAME_LENGTH} characters` }, { status: 400 });

            const newFolder: Folder = { uuid: uuidv4(), name, children: [] };
            environment.folders.push(newFolder);

            const childRef: FolderChild = { type: 'folder', uuid: newFolder.uuid };
            const parent = parentFolderUuid ? environment.folders.find(f => f.uuid === parentFolderUuid) : undefined;
            (parent?.children ?? environment.rootChildren).push(childRef);

            save();
            return Response.json({ success: true, folder: newFolder, ...hierarchy(environment) });
        }

        if (action === 'update') {
            if (!folderUuid) return Response.json({ error: 'Missing folderUuid' }, { status: 400 });
            const target = environment.folders.find(f => f.uuid === folderUuid);
            if (!target) return Response.json({ error: 'Folder not found' }, { status: 404 });

            // Only the name is editable; uuid and children are managed by create/move/delete
            const name = cleanName(folder?.name);
            if (!name) return Response.json({ error: `Folder name must be 1-${MAX_NAME_LENGTH} characters` }, { status: 400 });
            target.name = name;

            save();
            return Response.json({ success: true, ...hierarchy(environment) });
        }

        if (action === 'delete') {
            if (!folderUuid) return Response.json({ error: 'Missing folderUuid' }, { status: 400 });
            const target = environment.folders.find(f => f.uuid === folderUuid);
            if (!target) return Response.json({ error: 'Folder not found' }, { status: 404 });

            // Its routes and subfolders take its place in the parent, so nothing is lost
            const container = findContainer(environment, folderUuid) ?? environment.rootChildren;
            const index = container.findIndex(c => c.uuid === folderUuid);
            if (index === -1) container.push(...target.children);
            else container.splice(index, 1, ...target.children);
            environment.folders = environment.folders.filter(f => f.uuid !== folderUuid);

            save();
            return Response.json({ success: true, ...hierarchy(environment) });
        }

        if (action === 'move') {
            if (!itemUuid || (itemType !== 'route' && itemType !== 'folder')) {
                return Response.json({ error: 'Missing itemUuid or invalid itemType' }, { status: 400 });
            }
            const exists = itemType === 'route'
                ? environment.routes.some(r => r.uuid === itemUuid)
                : environment.folders.some(f => f.uuid === itemUuid);
            if (!exists) return Response.json({ error: `${itemType === 'route' ? 'Route' : 'Folder'} not found` }, { status: 404 });

            let destination = environment.rootChildren;
            if (targetFolderUuid) {
                const target = environment.folders.find(f => f.uuid === targetFolderUuid);
                if (!target) return Response.json({ error: 'Target folder not found' }, { status: 404 });
                if (itemType === 'folder' && isSelfOrDescendant(environment, itemUuid, targetFolderUuid)) {
                    return Response.json({ error: 'A folder cannot be moved into itself' }, { status: 400 });
                }
                destination = target.children;
            }

            const source = findContainer(environment, itemUuid);
            if (source) source.splice(source.findIndex(c => c.uuid === itemUuid), 1);
            destination.push({ type: itemType, uuid: itemUuid });

            save();
            return Response.json({ success: true, ...hierarchy(environment) });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('API Error managing folders:', error);
        return Response.json({ error: 'Failed to update folders' }, { status: 500 });
    }
}
