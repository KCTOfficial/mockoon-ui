import { FileDirectoryIcon, PlusIcon, XIcon } from '@primer/octicons-react';
import { Environment, Folder } from '@/types/mockoon';

export const MAX_FOLDER_NAME_LENGTH = 100;

/**
 * Folders of an environment in tree order, with their depth, for a destination picker.
 * Folders in `exclude` are left out together with everything inside them.
 */
export function folderOptions(env: Environment | undefined, exclude?: ReadonlySet<string>): { folder: Folder; depth: number }[] {
    if (!env) return [];
    const byId = new Map(env.folders.map(f => [f.uuid, f]));
    const result: { folder: Folder; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (uuids: string[], depth: number) => uuids.forEach(uuid => {
        const folder = byId.get(uuid);
        if (!folder || seen.has(uuid) || exclude?.has(uuid)) return;
        seen.add(uuid);
        result.push({ folder, depth });
        walk(folder.children.filter(c => c.type === 'folder').map(c => c.uuid), depth + 1);
    });
    walk(env.rootChildren.filter(c => c.type === 'folder').map(c => c.uuid), 0);
    return result;
}

interface FolderPickerProps {
    /** Prefix for the input ids, unique per dialog */
    id: string;
    env: Environment | undefined;
    /** '' for the top level */
    folderUuid: string;
    onFolderChange: (uuid: string) => void;
    /** null: no new folder; a string (maybe still empty) while one is being named */
    newFolderName: string | null;
    onNewFolderNameChange: (name: string | null) => void;
    exclude?: ReadonlySet<string>;
    disabled?: boolean;
}

/** Folder select for a destination, with "New folder" to create one inside the chosen folder. */
export default function FolderPicker({
    id, env, folderUuid, onFolderChange, newFolderName, onNewFolderNameChange, exclude, disabled,
}: FolderPickerProps) {
    const options = folderOptions(env, exclude);
    const parentName = options.find(o => o.folder.uuid === folderUuid)?.folder.name;

    return (
        <div className="space-y-3">
            <div className="min-w-0">
                <label htmlFor={`${id}-folder`} className="form-label">Folder</label>
                <select
                    id={`${id}-folder`}
                    value={folderUuid}
                    onChange={(e) => onFolderChange(e.target.value)}
                    disabled={disabled}
                    className="form-control w-full"
                >
                    <option value="">Top level</option>
                    {options.map(({ folder, depth }) => (
                        <option key={folder.uuid} value={folder.uuid}>{'  '.repeat(depth + 1)}{folder.name}</option>
                    ))}
                </select>
            </div>

            {newFolderName === null ? (
                <button
                    type="button"
                    onClick={() => onNewFolderNameChange('')}
                    disabled={disabled}
                    className="btn btn-sm btn-invisible !px-1.5 text-accent"
                >
                    <PlusIcon /> New folder
                </button>
            ) : (
                <div className="min-w-0">
                    <label htmlFor={`${id}-new-folder`} className="form-label">New folder name</label>
                    <div className="flex items-center gap-1.5">
                        <span className="text-fg-muted flex-shrink-0" aria-hidden="true"><FileDirectoryIcon /></span>
                        <input
                            id={`${id}-new-folder`}
                            type="text"
                            autoFocus
                            required
                            maxLength={MAX_FOLDER_NAME_LENGTH}
                            value={newFolderName}
                            onChange={(e) => onNewFolderNameChange(e.target.value)}
                            disabled={disabled}
                            aria-describedby={`${id}-new-folder-caption`}
                            className="form-control flex-1 min-w-0"
                        />
                        <button
                            type="button"
                            onClick={() => onNewFolderNameChange(null)}
                            disabled={disabled}
                            className="btn btn-invisible btn-icon btn-sm flex-shrink-0"
                            aria-label="Don't create a folder"
                            title="Don't create a folder"
                        >
                            <XIcon />
                        </button>
                    </div>
                    <p id={`${id}-new-folder-caption`} className="form-caption">
                        Created inside {parentName ? <>&quot;{parentName}&quot;</> : 'the top level'}.
                    </p>
                </div>
            )}
        </div>
    );
}
