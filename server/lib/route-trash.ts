import fs from 'fs';
import path from 'path';
import { Environment, FolderChild } from '@/types/mockoon';
import { getTrashDir } from './data-dir';
import { buildBundle } from './route-bundle';

/** Where a deleted route or folder came from, so "Restore" can put it back there. */
export interface DeletedFrom {
    filename: string;
    envName: string;
    /** Folder it was in; null at the top level */
    folderUuid: string | null;
    folderName: string | null;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Saves a route (or folder) about to be deleted to the recycle bin, as an export bundle with `deletedFrom`.
 * Call it before removing the item from the environment file, so a failed write loses nothing.
 */
export function trashItem(env: Environment, root: FolderChild, filename: string): string {
    const parent = (env.folders ?? []).find(f => f.children.some(c => c.uuid === root.uuid)) ?? null;
    const bundle = {
        ...buildBundle({ ...env, folders: env.folders ?? [], data: env.data ?? [], callbacks: env.callbacks ?? [] }, root),
        deletedFrom: {
            filename,
            envName: env.name,
            folderUuid: parent?.uuid ?? null,
            folderName: parent?.name ?? null,
        } satisfies DeletedFrom,
    };

    const dir = getTrashDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${root.type}-${slug(filename.replace(/\.json$/, '')) || 'environment'}-${stamp}.json`;
    // 'wx': two deletes in the same millisecond must not overwrite each other
    fs.writeFileSync(path.join(dir, id), JSON.stringify(bundle, null, 2), { encoding: 'utf-8', flag: 'wx' });
    return id;
}
