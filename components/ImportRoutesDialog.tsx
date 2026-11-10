import { useEffect, useMemo, useState } from 'react';
import { FileDirectoryIcon, FileIcon, XIcon } from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';
import { folderOptions } from './TransferDialog';

/** What an uploaded routes export holds, read in the browser before anything is sent. */
export interface RoutesFileSummary {
    routeCount: number;
    folderCount: number;
    exportedFrom: string | null;
    /** "GET /users" or the folder name, when the file holds one item */
    itemLabel: string | null;
}

/** Recognises a file written by "Export to file"; null for anything else (e.g. a whole environment). */
export function summarizeRoutesFile(content: unknown): RoutesFileSummary | null {
    if (!content || typeof content !== 'object') return null;
    const raw = content as Record<string, unknown>;
    if (raw.type !== 'mockoon-ui/routes' || !Array.isArray(raw.routes)) return null;
    const routes = raw.routes as { uuid?: string; method?: string; type?: string; endpoint?: string }[];
    const folders = (Array.isArray(raw.folders) ? raw.folders : []) as { uuid?: string; name?: string }[];
    const root = Array.isArray(raw.rootChildren) ? (raw.rootChildren[0] as { type?: string; uuid?: string } | undefined) : undefined;
    let itemLabel: string | null = null;
    if (root?.type === 'route') {
        const route = routes.find(r => r.uuid === root.uuid);
        if (route) itemLabel = `${(route.method || route.type || '').toUpperCase()} /${(route.endpoint ?? '').replace(/^\//, '')}`;
    } else if (root?.type === 'folder') {
        itemLabel = folders.find(f => f.uuid === root.uuid)?.name ?? null;
    }
    return {
        routeCount: routes.length,
        folderCount: folders.length,
        exportedFrom: typeof raw.exportedFrom === 'string' ? raw.exportedFrom : null,
        itemLabel,
    };
}

export interface RoutesImportResult {
    created: boolean;
    routeCount: number;
    folderCount: number;
    warnings: string[];
    target: Environment;
}

interface ImportRoutesDialogProps {
    file: File;
    summary: RoutesFileSummary;
    environments: Environment[];
    /** Preselected target: the environment open in the dashboard */
    activeFilename?: string;
    onClose: () => void;
    onImported: (result: RoutesImportResult) => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Asks where routes from an uploaded export go: into an existing environment, or a new one. */
export default function ImportRoutesDialog({ file, summary, environments, activeFilename, onClose, onImported }: ImportRoutesDialogProps) {
    const targets = environments.filter(env => env.filename);
    const [mode, setMode] = useState<'existing' | 'new'>(targets.length ? 'existing' : 'new');
    const [filename, setFilename] = useState(
        targets.find(env => env.filename === activeFilename)?.filename ?? targets[0]?.filename ?? ''
    );
    const [folderUuid, setFolderUuid] = useState('');
    const [newName, setNewName] = useState(
        summary.folderCount && summary.itemLabel ? summary.itemLabel : `${summary.exportedFrom ?? 'Imported'} routes`
    );
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const target = targets.find(env => env.filename === filename);
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
        setError(null);
        setIsPending(true);
        try {
            const form = new FormData();
            form.append('file', file);
            if (mode === 'new') {
                form.append('newEnvironmentName', newName);
            } else {
                form.append('filename', filename);
                if (folderUuid) form.append('targetFolderUuid', folderUuid);
            }
            const res = await fetch('/api/environments/items/import', { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Import failed.');
            setIsPending(false);
            onImported(data);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed.');
            setIsPending(false);
        }
    };

    const option = (value: 'existing' | 'new', title: string, description: string, disabled = false) => (
        <label
            className={`flex items-start gap-2.5 rounded-md border p-3 cursor-pointer transition-colors ${mode === value
                ? 'border-accent-emphasis bg-accent-subtle'
                : 'border-border-custom hover:bg-canvas-muted'} ${disabled ? 'opacity-60 !cursor-not-allowed' : ''}`}
        >
            <input
                type="radio"
                name="import-target"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={disabled || isPending}
                className="mt-0.5 accent-[var(--accent-emphasis)]"
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg-default">{title}</span>
                <span className="block text-xs text-fg-muted">{description}</span>
            </span>
        </label>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => !isPending && onClose()} />
            <div role="dialog" aria-modal="true" aria-labelledby="import-routes-title" className="Overlay relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="import-routes-title" className="text-sm font-semibold text-fg-default">Import routes</h2>
                    <button onClick={onClose} disabled={isPending} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}

                        <section aria-label="File" className="Box px-3 py-2.5 flex items-start gap-2.5 min-w-0">
                            {summary.folderCount > 0
                                ? <FileDirectoryIcon className="text-fg-muted mt-0.5 flex-shrink-0" />
                                : <FileIcon className="text-fg-muted mt-0.5 flex-shrink-0" />}
                            <div className="min-w-0">
                                <div className={`text-sm font-semibold text-fg-default truncate ${summary.folderCount ? '' : 'font-mono'}`}>
                                    {summary.itemLabel ?? file.name}
                                </div>
                                <div className="text-xs text-fg-muted truncate">
                                    {plural(summary.routeCount, 'route')}
                                    {summary.folderCount > 0 && ` · ${plural(summary.folderCount, 'folder')}`}
                                    {summary.exportedFrom && ` · from ${summary.exportedFrom}`}
                                    {' · '}<span title={file.name}>{file.name}</span>
                                </div>
                            </div>
                        </section>

                        <fieldset className="space-y-2">
                            <legend className="form-label">Where should they go?</legend>
                            {option('existing', 'Add to an existing environment', 'Keeps its port and settings; the routes are added next to its own.', targets.length === 0)}
                            {option('new', 'Create a new environment', 'With only these routes, on the next free port.')}
                        </fieldset>

                        {mode === 'existing' ? (
                            <div className="space-y-3">
                                <div className="min-w-0">
                                    <label htmlFor="import-env" className="form-label">Environment</label>
                                    <select
                                        id="import-env"
                                        value={filename}
                                        onChange={(e) => {
                                            setFilename(e.target.value);
                                            setFolderUuid('');
                                        }}
                                        disabled={isPending}
                                        className="form-control w-full"
                                    >
                                        {targets.map(env => <option key={env.filename} value={env.filename}>{env.name} (:{env.port})</option>)}
                                    </select>
                                </div>
                                <div className="min-w-0">
                                    <label htmlFor="import-folder" className="form-label">Folder</label>
                                    <select
                                        id="import-folder"
                                        value={folderUuid}
                                        onChange={(e) => setFolderUuid(e.target.value)}
                                        disabled={isPending}
                                        className="form-control w-full"
                                    >
                                        <option value="">Top level</option>
                                        {folders.map(({ folder, depth }) => (
                                            <option key={folder.uuid} value={folder.uuid}>{'  '.repeat(depth + 1)}{folder.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label htmlFor="import-new-name" className="form-label">Environment name</label>
                                <input
                                    id="import-new-name"
                                    type="text"
                                    required
                                    maxLength={100}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    disabled={isPending}
                                    className="form-control w-full"
                                />
                            </div>
                        )}

                        <p className="text-xs text-fg-muted">
                            Data buckets and callbacks the routes use come along. Everything gets new IDs, so the same file can be imported again.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-sm">Cancel</button>
                        <button
                            type="submit"
                            disabled={isPending || (mode === 'existing' ? !target : !newName.trim())}
                            className="btn btn-sm btn-primary"
                        >
                            {isPending ? 'Importing…' : mode === 'new' ? 'Create and import' : 'Import'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
