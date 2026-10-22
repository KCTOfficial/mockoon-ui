import fs from 'fs';
import { Environment, Folder, FolderChild } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';
import { resolveEnvFile } from '../../lib/data-dir';

export async function POST(req: Request) {
    try {
        const { filename, action, folder, folderUuid, parentFolderUuid } = await req.json();

        if (!filename) {
            return Response.json({ error: 'Missing filename' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        if (action === 'create') {
            const newFolder: Folder = {
                uuid: uuidv4(),
                name: folder?.name || 'New folder',
                children: []
            };
            environment.folders.push(newFolder);

            // Add to hierarchy
            const childRef: FolderChild = { type: 'folder', uuid: newFolder.uuid };
            if (parentFolderUuid) {
                const parent = environment.folders.find(f => f.uuid === parentFolderUuid);
                if (parent) parent.children.push(childRef);
                else environment.rootChildren.push(childRef);
            } else {
                environment.rootChildren.push(childRef);
            }

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true, folder: newFolder });
        }

        if (action === 'update') {
            if (!folderUuid || !folder) return Response.json({ error: 'Missing folderUuid or folder data' }, { status: 400 });

            const index = environment.folders.findIndex(f => f.uuid === folderUuid);
            if (index === -1) return Response.json({ error: 'Folder not found' }, { status: 404 });

            environment.folders[index] = { ...environment.folders[index], ...folder };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        if (action === 'delete') {
            if (!folderUuid) return Response.json({ error: 'Missing folderUuid' }, { status: 400 });

            // Remove from folders list
            environment.folders = environment.folders.filter(f => f.uuid !== folderUuid);

            // Remove from hierarchy (rootChildren or parent children)
            environment.rootChildren = environment.rootChildren.filter(c => c.uuid !== folderUuid);
            environment.folders.forEach(f => {
                f.children = f.children.filter(c => c.uuid !== folderUuid);
            });

            // Note: In real Mockoon, deleting a folder might "orphan" its children or delete them.
            // For now, we'll leave children orphaned in the folders/routes list but removed from the hierarchy.
            // A more robust implementation would move children to root.

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return Response.json({ success: true });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing folders:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
