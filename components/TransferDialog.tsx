import { useEffect, useMemo, useState } from 'react';
import { ArrowDownIcon, CopyIcon, FileDirectoryIcon, XIcon } from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';
import EnvAvatar from './shared/EnvAvatar';
import FolderPicker from './shared/FolderPicker';

// Kept here too: other dialogs import it from this module
export { folderOptions } from './shared/FolderPicker';

export type TransferMode = 'copy' | 'move';

export interface TransferResult {
    mode: TransferMode;
    itemUuid: string;
    /** New tree entries (copy, or move to another environment) or the same ones (move inside one) */
    itemUuids?: string[];
    /** Folder the items went into; null at the top level */
    folderUuid?: string | null;
    routeCount: number;
    folderCount: number;
    bucketCount: number;
    callbackCount: number;
    warnings: string[];
    source: Environment;
    target: Environment;
}

export interface TransferItem {
    type: 'route' | 'folder';
    uuid: string;
    /** How the item is shown, e.g. "GET /users" or the folder name */
    label: string;
    /** Extra detail next to the item, e.g. "3 routes" for a folder */
    detail?: string;
}

interface TransferDialogProps {
    /** One or more items of `source`, none inside another one of them */
    items: TransferItem[];
    /** Folder the item is in now (one item only); undefined at the top level */
    sourceFolder?: string;
    initialMode: TransferMode;
    source: Environment;
    environments: Environment[];
    onClose: () => void;
    /** Called after the server saved it; the dialog then closes */
    onDone: (result: TransferResult) => void;
}

/** How many items the "From" box lists before "and N more". */
const LISTED_ITEMS = 5;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function modeHelp(mode: TransferMode, source: string, sameEnvironment: boolean, many: boolean): string {
    if (sameEnvironment) {
        return mode === 'copy'
            ? `A copy is added to the chosen folder of "${source}". Paths already in use get a "-copy-N" suffix.`
            : `${many ? 'They move' : 'It moves'} to the chosen folder of "${source}".`;
    }
    return mode === 'copy'
        ? `A copy is added to the target. "${source}" keeps the original.`
        : `${many ? 'They are' : 'It is'} added to the target and removed from "${source}".`;
}

/**
 * Copies or moves routes and folders (with everything in them) to another environment, or to another folder of
 * the same one. Reads top to bottom: what to do, what goes (read-only), where it goes (the only inputs), then one button.
 */
export default function TransferDialog({
    items, sourceFolder, initialMode, source, environments, onClose, onDone,
}: TransferDialogProps) {
    // Other environments first (the usual target), then this one, for moving between its folders
    const targets = useMemo(() => {
        const others = environments.filter(env => env.filename && env.filename !== source.filename);
        return source.filename ? [...others, source] : others;
    }, [environments, source]);
    const [mode, setMode] = useState<TransferMode>(initialMode);
    const [targetFilename, setTargetFilename] = useState(targets[0]?.filename ?? '');
    const [targetFolderUuid, setTargetFolderUuid] = useState('');
    const [newFolderName, setNewFolderName] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const target = targets.find(env => env.filename === targetFilename);
    const sameEnvironment = !!target && target.filename === source.filename;
    // A folder cannot move into itself; a copy may go anywhere
    const excluded = useMemo(
        () => (sameEnvironment && mode === 'move' ? new Set(items.filter(i => i.type === 'folder').map(i => i.uuid)) : undefined),
        [sameEnvironment, mode, items]
    );
    const folderUuid = excluded?.has(targetFolderUuid) ? '' : targetFolderUuid;
    const many = items.length > 1;

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isPending, onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target || items.length === 0) return;
        setError(null);
        setIsPending(true);
        try {
            const res = await fetch('/api/environments/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceFilename: source.filename,
                    targetFilename,
                    ...(many
                        ? { items: items.map(({ type, uuid }) => ({ type, uuid })) }
                        : { itemType: items[0].type, itemUuid: items[0].uuid }),
                    mode,
                    targetFolderUuid: folderUuid || null,
                    ...(newFolderName !== null ? { newFolderName: newFolderName.trim() } : {}),
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
    const routeTotal = items.filter(i => i.type === 'route').length;
    const folderTotal = items.length - routeTotal;
    const what = many
        ? [routeTotal && plural(routeTotal, 'route'), folderTotal && plural(folderTotal, 'folder')].filter(Boolean).join(' and ')
        : items[0]?.type === 'folder' ? 'folder' : 'route';
    const usesWhat = items.some(i => i.type === 'folder') || many ? 'routes use' : 'route uses';

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
                    <h2 id="transfer-title" className="text-sm font-semibold text-fg-default">{verb} {what}</h2>
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
                            <p className="form-caption">{modeHelp(mode, source.name, sameEnvironment, many)}</p>
                        </div>

                        {/* 2 + 3 grouped tightly: from -> to reads as one flow */}
                        <div className="space-y-2">
                            {/* 2. What goes: read-only, so it looks different from the inputs */}
                            <section aria-label="From" className="rounded-md border border-border-custom bg-canvas-muted p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">From</div>
                                <ul className="mt-1.5 space-y-1">
                                    {items.slice(0, LISTED_ITEMS).map(item => (
                                        <li key={item.uuid} className="flex items-center gap-2 min-w-0">
                                            {item.type === 'folder' && <FileDirectoryIcon className="text-fg-muted flex-shrink-0" />}
                                            <span className={`truncate text-sm text-fg-default ${item.type === 'route' ? 'font-mono' : 'font-semibold'}`} title={item.label}>
                                                {item.label}
                                            </span>
                                            {item.detail && <span className="Counter flex-shrink-0">{item.detail}</span>}
                                        </li>
                                    ))}
                                    {items.length > LISTED_ITEMS && (
                                        <li className="text-xs text-fg-muted">and {items.length - LISTED_ITEMS} more</li>
                                    )}
                                </ul>
                                <div className="mt-1.5 flex items-center gap-1.5 min-w-0 text-xs text-fg-muted">
                                    <EnvAvatar name={source.name} className="!w-5 !h-5 !text-[9px]" />
                                    <span className="truncate text-fg-default" title={source.name}>{source.name}</span>
                                    <span className="font-mono flex-shrink-0">:{source.port}</span>
                                    {!many && (
                                        <>
                                            <span aria-hidden="true" className="flex-shrink-0">›</span>
                                            <span className="truncate flex-shrink-0 max-w-[40%]" title={sourceFolder ?? 'Top level'}>{sourceFolder ?? 'Top level'}</span>
                                        </>
                                    )}
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
                                    <p className="mt-1.5 text-sm text-fg-muted">There is no environment to {mode} to.</p>
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
                                                    <option key={env.filename} value={env.filename}>
                                                        {env.name} (:{env.port}){env.filename === source.filename ? ' · this environment' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <FolderPicker
                                            id="transfer"
                                            env={target}
                                            folderUuid={folderUuid}
                                            onFolderChange={setTargetFolderUuid}
                                            newFolderName={newFolderName}
                                            onNewFolderNameChange={setNewFolderName}
                                            exclude={excluded}
                                            disabled={isPending}
                                        />
                                    </div>
                                )}
                            </section>
                        </div>

                        <p className="text-xs text-fg-muted">
                            {sameEnvironment
                                ? 'Restart the running mock server to apply.'
                                : `Data buckets and callbacks the ${usesWhat} come along when the target does not have them. Restart running mock servers to apply.`}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-sm">Cancel</button>
                        {/* Short on purpose: the target is right above, and long environment names would stretch it */}
                        <button
                            type="submit"
                            disabled={isPending || !target || items.length === 0 || (newFolderName !== null && !newFolderName.trim())}
                            className="btn btn-sm btn-primary"
                        >
                            {isPending ? `${mode === 'copy' ? 'Copying' : 'Moving'}…` : `${verb} now`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
