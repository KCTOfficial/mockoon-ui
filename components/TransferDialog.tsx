import { useEffect, useMemo, useState } from 'react';
import { ArrowDownIcon, CopyIcon, FileDirectoryIcon, XIcon } from '@primer/octicons-react';
import { Environment, Folder } from '@/types/mockoon';
import EnvAvatar from './shared/EnvAvatar';

export type TransferMode = 'copy' | 'move';

export interface TransferResult {
    mode: TransferMode;
    itemUuid: string;
    routeCount: number;
    folderCount: number;
    bucketCount: number;
    callbackCount: number;
    warnings: string[];
    source: Environment;
    target: Environment;
}

interface TransferDialogProps {
    item: { type: 'route' | 'folder'; uuid: string };
    /** How the item is shown, e.g. "GET /users" or the folder name */
    itemLabel: string;
    /** Extra detail next to the item, e.g. "3 routes" for a folder */
    itemDetail?: string;
    /** Folder the item is in now; undefined at the top level */
    sourceFolder?: string;
    initialMode: TransferMode;
    source: Environment;
    environments: Environment[];
    onClose: () => void;
    /** Called after the server saved it; the dialog then closes */
    onDone: (result: TransferResult) => void;
}

/** Folders of an environment in tree order, with their depth, for the destination picker. */
export function folderOptions(env: Environment | undefined): { folder: Folder; depth: number }[] {
    if (!env) return [];
    const byId = new Map(env.folders.map(f => [f.uuid, f]));
    const result: { folder: Folder; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (uuids: string[], depth: number) => uuids.forEach(uuid => {
        const folder = byId.get(uuid);
        if (!folder || seen.has(uuid)) return;
        seen.add(uuid);
        result.push({ folder, depth });
        walk(folder.children.filter(c => c.type === 'folder').map(c => c.uuid), depth + 1);
    });
    walk(env.rootChildren.filter(c => c.type === 'folder').map(c => c.uuid), 0);
    return result;
}

const MODE_HELP: Record<TransferMode, (source: string) => string> = {
    copy: (source) => `A copy is added to the target. "${source}" keeps the original.`,
    move: (source) => `It is added to the target and removed from "${source}".`,
};

/**
 * Copies or moves a route or a folder (with everything in it) to another environment.
 * Reads top to bottom: what to do, what goes (read-only), where it goes (the only inputs), then one button.
 */
export default function TransferDialog({
    item, itemLabel, itemDetail, sourceFolder, initialMode, source, environments, onClose, onDone,
}: TransferDialogProps) {
    const targets = useMemo(() => environments.filter(env => env.filename && env.filename !== source.filename), [environments, source.filename]);
    const [mode, setMode] = useState<TransferMode>(initialMode);
    const [targetFilename, setTargetFilename] = useState(targets[0]?.filename ?? '');
    const [targetFolderUuid, setTargetFolderUuid] = useState('');
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const target = targets.find(env => env.filename === targetFilename);
    const folders = useMemo(() => folderOptions(target), [target]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isPending, onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target) return;
        setError(null);
        setIsPending(true);
        try {
            const res = await fetch('/api/environments/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceFilename: source.filename,
                    targetFilename,
                    itemType: item.type,
                    itemUuid: item.uuid,
                    mode,
                    targetFolderUuid: targetFolderUuid || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Failed to ${mode}.`);
            setIsPending(false);
            onDone(data);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${mode}.`);
            setIsPending(false);
        }
    };

    const verb = mode === 'copy' ? 'Copy' : 'Move';
    const what = item.type === 'folder' ? 'folder' : 'route';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => !isPending && onClose()} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="transfer-title"
                className="Overlay relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="transfer-title" className="text-sm font-semibold text-fg-default">{verb} {what} to another environment</h2>
                    <button onClick={onClose} disabled={isPending} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}

                        {/* 1. What to do: decides the meaning of everything below */}
                        <div>
                            <span id="transfer-mode-label" className="form-label">Action</span>
                            <div className="SegmentedControl" role="radiogroup" aria-labelledby="transfer-mode-label">
                                {(['copy', 'move'] as const).map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        role="radio"
                                        aria-checked={mode === option}
                                        onClick={() => setMode(option)}
                                        disabled={isPending}
                                        className={`SegmentedControl-item ${mode === option ? 'is-selected' : ''}`}
                                    >
                                        {option === 'copy' ? 'Copy' : 'Move'}
                                    </button>
                                ))}
                            </div>
                            <p className="form-caption">{MODE_HELP[mode](source.name)}</p>
                        </div>

                        {/* 2 + 3 grouped tightly: from -> to reads as one flow */}
                        <div className="space-y-2">
                            {/* 2. What goes: read-only, so it looks different from the inputs */}
                            <section aria-label="From" className="rounded-md border border-border-custom bg-canvas-muted p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">From</div>
                                <div className="mt-1.5 flex items-center gap-2 min-w-0">
                                    {item.type === 'folder' && <FileDirectoryIcon className="text-fg-muted flex-shrink-0" />}
                                    <span className={`truncate text-sm text-fg-default ${item.type === 'route' ? 'font-mono' : 'font-semibold'}`} title={itemLabel}>
                                        {itemLabel}
                                    </span>
                                    {itemDetail && <span className="Counter flex-shrink-0">{itemDetail}</span>}
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 min-w-0 text-xs text-fg-muted">
                                    <EnvAvatar name={source.name} className="!w-5 !h-5 !text-[9px]" />
                                    <span className="truncate text-fg-default" title={source.name}>{source.name}</span>
                                    <span className="font-mono flex-shrink-0">:{source.port}</span>
                                    <span aria-hidden="true" className="flex-shrink-0">›</span>
                                    <span className="truncate flex-shrink-0 max-w-[40%]" title={sourceFolder ?? 'Top level'}>{sourceFolder ?? 'Top level'}</span>
                                </div>
                            </section>

                            <div className="flex justify-center" aria-hidden="true">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border-custom bg-canvas px-2.5 py-0.5 text-xs font-semibold text-fg-muted">
                                    {mode === 'copy' ? <CopyIcon size={12} /> : <ArrowDownIcon size={12} />}
                                    {verb} to
                                </span>
                            </div>

                            {/* 3. Where it goes: the only inputs, highlighted as the destination */}
                            <section aria-label="To" className="rounded-md border border-accent-emphasis bg-accent-subtle p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">To</div>
                                {targets.length === 0 ? (
                                    <p className="mt-1.5 text-sm text-fg-muted">There is no other environment. Create one first.</p>
                                ) : (
                                    <div className="mt-1.5 space-y-3">
                                        <div className="min-w-0">
                                            <label htmlFor="transfer-target" className="form-label">Environment</label>
                                            <select
                                                id="transfer-target"
                                                value={targetFilename}
                                                onChange={(e) => {
                                                    setTargetFilename(e.target.value);
                                                    setTargetFolderUuid('');
                                                }}
                                                disabled={isPending}
                                                className="form-control w-full"
                                            >
                                                {targets.map(env => (
                                                    <option key={env.filename} value={env.filename}>{env.name} (:{env.port})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="transfer-folder" className="form-label">Folder</label>
                                            <select
                                                id="transfer-folder"
                                                value={targetFolderUuid}
                                                onChange={(e) => setTargetFolderUuid(e.target.value)}
                                                disabled={isPending}
                                                className="form-control w-full"
                                            >
                                                <option value="">Top level</option>
                                                {folders.map(({ folder, depth }) => (
                                                    <option key={folder.uuid} value={folder.uuid}>
                                                        {'  '.repeat(depth + 1)}{folder.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>

                        <p className="text-xs text-fg-muted">
                            Data buckets and callbacks the {item.type === 'folder' ? 'routes use' : 'route uses'} come along when the
                            target does not have them. Restart running mock servers to apply.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-sm">Cancel</button>
                        {/* Short on purpose: the target is right above, and long environment names would stretch it */}
                        <button type="submit" disabled={isPending || !target} className="btn btn-sm btn-primary">
                            {isPending ? `${mode === 'copy' ? 'Copying' : 'Moving'}…` : `${verb} now`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
