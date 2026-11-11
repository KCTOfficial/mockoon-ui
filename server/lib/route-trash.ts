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
    const content = JSON.stringify(bundle, null, 2);
    const now = Date.now();
    // 'wx': two deletes in the same millisecond (a bulk delete) must not overwrite each other, so a taken
    // name moves on by a millisecond; the name keeps the format the recycle bin reads the time from
    for (let offset = 0; ; offset++) {
        const stamp = new Date(now + offset).toISOString().replace(/[:.]/g, '-');
        const id = `${root.type}-${slug(filename.replace(/\.json$/, '')) || 'environment'}-${stamp}.json`;
        try {
            fs.writeFileSync(path.join(dir, id), content, { encoding: 'utf-8', flag: 'wx' });
            return id;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || offset >= 10_000) throw error;
        }
    }
}
