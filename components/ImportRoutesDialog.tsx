import { useEffect, useState } from 'react';
import { FileDirectoryIcon, FileIcon, ServerIcon, XIcon } from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';
import FolderPicker from './shared/FolderPicker';

/** What an uploaded file holds, read in the browser before anything is sent. */
export interface RoutesFileSummary {
    /** A file written by "Export to file", or a whole Mockoon environment */
    kind: 'bundle' | 'environment';
    routeCount: number;
    folderCount: number;
    /** Environment it was exported from, or the environment's own name */
    exportedFrom: string | null;
    /** "GET /users" or the folder name, when an export holds one item */
    itemLabel: string | null;
    /** The environment's port (whole environments only) */
    port: number | null;
}

/**
 * Recognises a file written by "Export to file" or a whole Mockoon environment (routes and a route tree);
 * null for anything else.
 */
export function summarizeRoutesFile(content: unknown): RoutesFileSummary | null {
    if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
    const raw = content as Record<string, unknown>;
    const kind = raw.type === 'mockoon-ui/routes' ? 'bundle' : 'environment';
    if (!Array.isArray(raw.routes) || (kind === 'environment' && !Array.isArray(raw.rootChildren))) return null;
    const routes = raw.routes as { uuid?: string; method?: string; type?: string; endpoint?: string }[];
    const folders = (Array.isArray(raw.folders) ? raw.folders : []) as { uuid?: string; name?: string }[];
    const roots = Array.isArray(raw.rootChildren) ? (raw.rootChildren as { type?: string; uuid?: string }[]) : [];
    let itemLabel: string | null = null;
    const root = kind === 'bundle' && roots.length === 1 ? roots[0] : undefined;
    if (root?.type === 'route') {
        const route = routes.find(r => r.uuid === root.uuid);
        if (route) itemLabel = `${(route.method || route.type || '').toUpperCase()} /${(route.endpoint ?? '').replace(/^\//, '')}`;
    } else if (root?.type === 'folder') {
        itemLabel = folders.find(f => f.uuid === root.uuid)?.name ?? null;
    }
    const name = kind === 'bundle' ? raw.exportedFrom : raw.name;
    return {
        kind,
        routeCount: routes.length,
        folderCount: folders.length,
        exportedFrom: typeof name === 'string' && name.trim() ? name : null,
        itemLabel,
        port: kind === 'environment' && typeof raw.port === 'number' ? raw.port : null,
    };
}

export interface RoutesImportResult {
    created: boolean;
    routeCount: number;
    folderCount: number;
    warnings: string[];
    target: Environment;
}

export type ImportMode = 'existing' | 'new';

interface ImportRoutesDialogProps {
    file: File;
    summary: RoutesFileSummary;
    environments: Environment[];
    /** Preselected target: the environment open in the dashboard */
    activeFilename?: string;
    /** Preselected folder of that environment */
    initialFolderUuid?: string;
    /** Preselected choice; by default an export goes into an existing environment and an environment stays its own */
    initialMode?: ImportMode;
    onClose: () => void;
    onImported: (result: RoutesImportResult) => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Asks where an uploaded file goes: an export into an existing environment (and folder) or a new one; a whole
 * environment as its own environment, or just its routes into an existing one (and folder).
 */
export default function ImportRoutesDialog({
    file, summary, environments, activeFilename, initialFolderUuid, initialMode, onClose, onImported,
}: ImportRoutesDialogProps) {
    const isEnvironment = summary.kind === 'environment';
    const targets = environments.filter(env => env.filename);
    const canAddToExisting = targets.length > 0 && summary.routeCount + summary.folderCount > 0;
    const [mode, setMode] = useState<ImportMode>(() => {
        const preferred = initialMode ?? (isEnvironment ? 'new' : 'existing');
        return preferred === 'existing' && canAddToExisting ? 'existing' : 'new';
    });
    const [filename, setFilename] = useState(
        targets.find(env => env.filename === activeFilename)?.filename ?? targets[0]?.filename ?? ''
    );
    const [folderUuid, setFolderUuid] = useState(() => {
        const env = targets.find(e => e.filename === filename);
        return initialFolderUuid && env?.folders.some(f => f.uuid === initialFolderUuid) ? initialFolderUuid : '';
    });
    const [newFolderName, setNewFolderName] = useState<string | null>(null);
    const [newName, setNewName] = useState(
        summary.folderCount && summary.itemLabel ? summary.itemLabel : `${summary.exportedFrom ?? 'Imported'} routes`
    );
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const target = targets.find(env => env.filename === filename);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isPending, onClose]);

    /** A whole environment as its own: the regular environment import, which keeps its port and settings. */
    const importEnvironment = async (): Promise<RoutesImportResult> => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/environments/import', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Import failed.');
        const environment = data.environment as Environment;
        return {
            created: true,
            routeCount: environment.routes?.length ?? 0,
            folderCount: environment.folders?.length ?? 0,
            warnings: [],
            target: environment,
        };
    };

    const importRoutes = async (): Promise<RoutesImportResult> => {
        const form = new FormData();
        form.append('file', file);
        if (mode === 'new') {
            form.append('newEnvironmentName', newName);
        } else {
            form.append('filename', filename);
            if (folderUuid) form.append('targetFolderUuid', folderUuid);
            if (newFolderName !== null) form.append('newFolderName', newFolderName.trim());
        }
        const res = await fetch('/api/environments/items/import', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Import failed.');
        return data;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsPending(true);
        try {
            const result = isEnvironment && mode === 'new' ? await importEnvironment() : await importRoutes();
            setIsPending(false);
            onImported(result);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed.');
            setIsPending(false);
        }
    };

    const option = (value: ImportMode, title: string, description: string, disabled = false) => (
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

    const submitDisabled = isPending || (mode === 'existing'
        ? !target || (newFolderName !== null && !newFolderName.trim())
        : !isEnvironment && !newName.trim());
    const submitLabel = mode === 'existing' ? 'Import' : isEnvironment ? 'Import environment' : 'Create and import';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => !isPending && onClose()} />
            <div role="dialog" aria-modal="true" aria-labelledby="import-routes-title" className="Overlay relative w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="import-routes-title" className="text-sm font-semibold text-fg-default">
                        {isEnvironment ? 'Import environment' : 'Import routes'}
                    </h2>
                    <button onClick={onClose} disabled={isPending} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}

                        <section aria-label="File" className="Box px-3 py-2.5 flex items-start gap-2.5 min-w-0">
                            {isEnvironment
                                ? <ServerIcon className="text-fg-muted mt-0.5 flex-shrink-0" />
                                : summary.folderCount > 0
                                    ? <FileDirectoryIcon className="text-fg-muted mt-0.5 flex-shrink-0" />
                                    : <FileIcon className="text-fg-muted mt-0.5 flex-shrink-0" />}
                            <div className="min-w-0">
                                <div className={`text-sm font-semibold text-fg-default truncate ${summary.folderCount || isEnvironment ? '' : 'font-mono'}`}>
                                    {(isEnvironment ? summary.exportedFrom : summary.itemLabel) ?? file.name}
                                </div>
                                <div className="text-xs text-fg-muted truncate">
                                    {isEnvironment && 'Mockoon environment · '}
                                    {plural(summary.routeCount, 'route')}
                                    {summary.folderCount > 0 && ` · ${plural(summary.folderCount, 'folder')}`}
                                    {!isEnvironment && summary.exportedFrom && ` · from ${summary.exportedFrom}`}
                                    {isEnvironment && summary.port !== null && ` · :${summary.port}`}
                                    {' · '}<span title={file.name}>{file.name}</span>
                                </div>
                            </div>
                        </section>

                        <fieldset className="space-y-2">
                            <legend className="form-label">{isEnvironment ? 'How should it be imported?' : 'Where should they go?'}</legend>
                            {isEnvironment ? (
                                <>
                                    {option('new', 'Import as its own environment', 'Keeps its name, settings and port (or takes the next free port).')}
                                    {option('existing', 'Add its routes to an existing environment',
                                        'Only its routes and folders, with the data buckets and callbacks they use. Its port and settings are not imported.',
                                        !canAddToExisting)}
                                </>
                            ) : (
                                <>
                                    {option('existing', 'Add to an existing environment', 'Keeps its port and settings; the routes are added next to its own.', !canAddToExisting)}
                                    {option('new', 'Create a new environment', 'With only these routes, on the next free port.')}
                                </>
                            )}
                        </fieldset>

                        {mode === 'existing' && (
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
                                <FolderPicker
                                    id="import"
                                    env={target}
                                    folderUuid={folderUuid}
                                    onFolderChange={setFolderUuid}
                                    newFolderName={newFolderName}
                                    onNewFolderNameChange={setNewFolderName}
                                    disabled={isPending}
                                />
                            </div>
                        )}

                        {mode === 'new' && !isEnvironment && (
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
                            {isEnvironment && mode === 'new'
                                ? 'It gets a new ID, so the same file can be imported again.'
                                : 'Data buckets and callbacks the routes use come along. Everything gets new IDs, so the same file can be imported again.'}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-sm">Cancel</button>
                        <button type="submit" disabled={submitDisabled} className="btn btn-sm btn-primary">
                            {isPending ? 'Importing…' : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
