import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertIcon, FileDirectoryIcon, HistoryIcon, TrashIcon, XIcon } from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';
import ConfirmDialog from './shared/ConfirmDialog';
import { folderOptions } from './TransferDialog';

export interface TrashItem {
    id: string;
    kind: 'environment' | 'route' | 'folder';
    name: string;
    /** For a route or folder: where it was deleted from */
    deletedFrom?: { filename: string; envName: string; folderUuid: string | null; folderName: string | null };
    /** For a route or folder: its environment no longer exists */
    sourceMissing?: boolean;
    port: number | null;
    originalFilename: string;
    deletedAt: string;
    routeCount: number;
    invalid: boolean;
}

/** A whole environment came back (possibly on another port) */
export interface EnvironmentRestore {
    environment: Environment;
    previousPort: number | null;
    portChanged: boolean;
}

/** A route or folder went back into an environment, saved as `target` */
export interface ItemRestore {
    kind: 'route' | 'folder';
    name: string;
    target: Environment;
    itemUuids: string[];
    restoredToFolder: boolean;
    warnings: string[];
}

export type RestoreResult = EnvironmentRestore | ItemRestore;

interface RecycleBinDialogProps {
    /** Current environments: where a route can go when its own environment is gone */
    environments: Environment[];
    onClose: () => void;
    onRestored: (result: RestoreResult) => void;
    /** Number of items left, after loading and after every change */
    onCountChange: (count: number) => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

type Pending = { kind: 'delete'; item: TrashItem } | { kind: 'empty' };

const KIND_LABELS: Record<TrashItem['kind'], string> = { environment: 'Environment', route: 'Route', folder: 'Folder' };

// Length of the fade-out of a restored or deleted row
const LEAVE_MS = 180;

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Picks another environment (and folder) for a route or folder whose own environment was deleted. */
function RestoreTargetPicker({ item, environments, busy, onCancel, onRestore }: {
    item: TrashItem;
    environments: Environment[];
    busy: boolean;
    onCancel: () => void;
    onRestore: (filename: string, folderUuid: string | null) => void;
}) {
    const targets = environments.filter(env => env.filename);
    const [filename, setFilename] = useState(targets[0]?.filename ?? '');
    const [folderUuid, setFolderUuid] = useState('');
    const target = targets.find(env => env.filename === filename);
    const folders = useMemo(() => folderOptions(target), [target]);
    const what = item.kind === 'folder' ? 'folder' : 'route';

    return (
        <div className="mt-2.5 rounded-md border border-attention-muted bg-attention-subtle p-3 space-y-3">
            <p className="flex items-start gap-2 text-[13px] text-fg-default">
                <AlertIcon className="text-attention mt-0.5 flex-shrink-0" />
                <span>
                    <strong>{item.deletedFrom?.envName}</strong> no longer exists. Choose another environment to restore this {what} into.
                </span>
            </p>
            {targets.length === 0 ? (
                <p className="text-xs text-fg-muted">There is no environment yet. Create or restore one first.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="min-w-0">
                        <label htmlFor={`restore-env-${item.id}`} className="form-label">Environment</label>
                        <select
                            id={`restore-env-${item.id}`}
                            value={filename}
                            onChange={(e) => {
                                setFilename(e.target.value);
                                setFolderUuid('');
                            }}
                            disabled={busy}
                            className="form-control form-control-sm w-full"
                        >
                            {targets.map(env => <option key={env.filename} value={env.filename}>{env.name} (:{env.port})</option>)}
                        </select>
                    </div>
                    <div className="min-w-0">
                        <label htmlFor={`restore-folder-${item.id}`} className="form-label">Folder</label>
                        <select
                            id={`restore-folder-${item.id}`}
                            value={folderUuid}
                            onChange={(e) => setFolderUuid(e.target.value)}
                            disabled={busy}
                            className="form-control form-control-sm w-full"
                        >
                            <option value="">Top level</option>
                            {folders.map(({ folder, depth }) => (
                                <option key={folder.uuid} value={folder.uuid}>{'  '.repeat(depth + 1)}{folder.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={busy} className="btn btn-sm">Cancel</button>
                <button
                    type="button"
                    onClick={() => onRestore(filename, folderUuid || null)}
                    disabled={busy || !target}
                    className="btn btn-sm btn-primary"
                >
                    {busy ? 'Restoring…' : target ? `Restore to ${target.name}` : 'Restore'}
                </button>
            </div>
        </div>
    );
}

/** Deleted environments, routes and folders (data/.deleted/): restore them, or delete them for good. */
export default function RecycleBinDialog({ environments, onClose, onRestored, onCountChange, notify }: RecycleBinDialogProps) {
    const [items, setItems] = useState<TrashItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    // Item whose "restore to another environment" picker is open
    const [pickingId, setPickingId] = useState<string | null>(null);
    // Rows fading out after a restore or delete
    const [leaving, setLeaving] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/environments/trash');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to load the recycle bin.');
            setItems(data.items);
            onCountChange(data.items.length);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load the recycle bin.');
        }
    }, [onCountChange]);

    useEffect(() => {
        load();
    }, [load]);

    // Escape closes this dialog, unless a confirmation on top of it handles the key
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !pending && !busyId) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [pending, busyId, onClose]);

    const post = async (body: object) => {
        const res = await fetch('/api/environments/trash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: res.status });
        return data;
    };

    /** Fades the rows out, then drops them; the count updates right away. */
    const remove = (ids: string[]) => {
        setLeaving(prev => new Set([...prev, ...ids]));
        onCountChange((items ?? []).filter(i => !ids.includes(i.id)).length);
        setTimeout(() => {
            setItems(prev => (prev ?? []).filter(i => !ids.includes(i.id)));
            setLeaving(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
        }, LEAVE_MS);
    };

    const handleRestore = async (item: TrashItem, choice?: { filename: string; folderUuid: string | null }) => {
        // Its environment is gone: ask where it should go instead
        if (!choice && item.kind !== 'environment' && item.sourceMissing) {
            setPickingId(item.id);
            return;
        }
        setError(null);
        setBusyId(item.id);
        try {
            const data = await post({
                action: 'restore',
                id: item.id,
                ...(choice ? { targetFilename: choice.filename, targetFolderUuid: choice.folderUuid } : {}),
            });
            setPickingId(null);
            remove([item.id]);
            onRestored(data);
        } catch (err) {
            // Its environment was deleted after the list was loaded
            if (!choice && item.kind !== 'environment' && (err as { status?: number }).status === 409) {
                setItems(prev => (prev ?? []).map(i => (i.id === item.id ? { ...i, sourceMissing: true } : i)));
                setPickingId(item.id);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to restore.');
            }
        } finally {
            setBusyId(null);
        }
    };

    const handleConfirm = async () => {
        if (!pending) return;
        setError(null);
        try {
            if (pending.kind === 'delete') {
                await post({ action: 'delete', id: pending.item.id });
                remove([pending.item.id]);
                notify(`"${pending.item.name}" deleted permanently`);
            } else {
                const data = await post({ action: 'empty' });
                remove((items ?? []).map(i => i.id));
                notify(`Recycle bin emptied (${data.deleted} deleted permanently)`);
            }
            setPending(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete.');
            setPending(null);
            // Resync in case part of it went through
            load();
        }
    };

    const visible = items?.filter(i => !leaving.has(i.id)) ?? [];
    const isEmpty = items !== null && items.length === 0;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => !busyId && onClose()} />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="recycle-bin-title"
                    className="Overlay relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                        <div className="flex items-center gap-2">
                            <h2 id="recycle-bin-title" className="text-sm font-semibold text-fg-default">Recycle bin</h2>
                            {items && <span className="Counter">{visible.length}</span>}
                        </div>
                        <button onClick={onClose} disabled={!!busyId} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                            <XIcon />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}

                        {!items && !error && <p className="text-sm text-fg-muted text-center py-6">Loading…</p>}

                        {isEmpty && (
                            <div className="text-center py-8">
                                <TrashIcon size={24} className="text-fg-muted mx-auto" />
                                <p className="mt-2 text-sm text-fg-default">The recycle bin is empty</p>
                                <p className="mt-1 text-xs text-fg-muted">Deleted environments and routes stay here until you restore or delete them.</p>
                            </div>
                        )}

                        {!!items?.length && (
                            <>
                                <p className="text-xs text-fg-muted">
                                    Environments come back on their old port when it is still free, otherwise on the next free
                                    one, and start stopped. Routes and folders go back to their environment and folder.
                                </p>
                                <ul className="Box divide-y divide-border-muted overflow-hidden">
                                    {items.map(item => (
                                        <li
                                            key={item.id}
                                            className={`px-3 py-2.5 transition-[opacity,transform] ease-out ${leaving.has(item.id) ? 'opacity-0 -translate-x-2' : 'opacity-100'}`}
                                            style={{ transitionDuration: `${LEAVE_MS}ms` }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {item.kind === 'folder' && <FileDirectoryIcon size={14} className="text-fg-muted flex-shrink-0" />}
                                                        <span className={`text-sm font-semibold text-fg-default truncate ${item.kind === 'route' ? 'font-mono' : ''}`}>{item.name}</span>
                                                        <span className="Label text-fg-muted flex-shrink-0">{KIND_LABELS[item.kind]}</span>
                                                        {item.invalid && <span className="Label text-danger border-danger-emphasis flex-shrink-0">Unreadable</span>}
                                                    </div>
                                                    <p className="text-xs text-fg-muted truncate">
                                                        {item.deletedFrom && (
                                                            <span className={item.sourceMissing ? 'text-attention' : undefined}>
                                                                from {item.deletedFrom.envName}
                                                                {item.deletedFrom.folderName && ` › ${item.deletedFrom.folderName}`}
                                                                {item.sourceMissing && ' (deleted)'} ·{' '}
                                                            </span>
                                                        )}
                                                        {item.port !== null && <span className="font-mono">:{item.port} · </span>}
                                                        {!item.invalid && item.kind !== 'route' && `${item.routeCount} route${item.routeCount === 1 ? '' : 's'} · `}
                                                        Deleted {formatDate(item.deletedAt)}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleRestore(item)}
                                                    disabled={item.invalid || !!busyId || pickingId === item.id || leaving.has(item.id)}
                                                    className="btn btn-sm flex-shrink-0"
                                                    title={item.invalid ? 'Not a valid environment file' : `Restore ${item.name}`}
                                                    aria-label={`Restore ${item.name}`}
                                                >
                                                    <HistoryIcon className={busyId === item.id && pickingId !== item.id ? 'animate-spin' : undefined} />
                                                    <span className="hidden sm:inline">{busyId === item.id && pickingId !== item.id ? 'Restoring…' : 'Restore'}</span>
                                                </button>
                                                <button
                                                    onClick={() => setPending({ kind: 'delete', item })}
                                                    disabled={!!busyId || leaving.has(item.id)}
                                                    className="btn btn-sm btn-icon flex-shrink-0 hover:!text-danger"
                                                    title="Delete permanently"
                                                    aria-label={`Delete ${item.name} permanently`}
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                            {pickingId === item.id && (
                                                <RestoreTargetPicker
                                                    item={item}
                                                    environments={environments}
                                                    busy={busyId === item.id}
                                                    onCancel={() => setPickingId(null)}
                                                    onRestore={(filename, folderUuid) => handleRestore(item, { filename, folderUuid })}
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-muted">
                        <button
                            onClick={() => setPending({ kind: 'empty' })}
                            disabled={!visible.length || !!busyId}
                            className="btn btn-sm btn-danger"
                        >
                            Empty recycle bin
                        </button>
                        <button onClick={onClose} disabled={!!busyId} className="btn btn-sm">
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {pending && (
                <ConfirmDialog
                    title={pending.kind === 'delete' ? 'Delete permanently' : 'Empty recycle bin'}
                    confirmLabel={pending.kind === 'delete' ? 'Delete permanently' : 'Empty recycle bin'}
                    onConfirm={handleConfirm}
                    onCancel={() => setPending(null)}
                >
                    {pending.kind === 'delete' ? (
                        <>
                            Permanently delete <strong className="text-fg-default">{pending.item.name}</strong>
                            {pending.item.kind === 'environment' ? ' with its routes and data buckets' : ''}? This cannot be undone.
                        </>
                    ) : (
                        <>Permanently delete all {visible.length} items in the recycle bin? This cannot be undone.</>
                    )}
                </ConfirmDialog>
            )}
        </>
    );
}
