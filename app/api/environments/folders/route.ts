import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment, Folder, FolderChild } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const { filename, action, folder, folderUuid, parentFolderUuid } = await req.json();

        if (!filename) {
            return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
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
            return NextResponse.json({ success: true, folder: newFolder });
        }

        if (action === 'update') {
            if (!folderUuid || !folder) return NextResponse.json({ error: 'Missing folderUuid or folder data' }, { status: 400 });

            const index = environment.folders.findIndex(f => f.uuid === folderUuid);
            if (index === -1) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

            environment.folders[index] = { ...environment.folders[index], ...folder };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        if (action === 'delete') {
            if (!folderUuid) return NextResponse.json({ error: 'Missing folderUuid' }, { status: 400 });

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
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing folders:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
