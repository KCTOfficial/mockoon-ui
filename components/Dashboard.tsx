import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Environment, Route, LogEntry } from '@/types/mockoon';
import Sidebar, { MainView } from './Sidebar';
import RouteList from './RouteList';
import RouteEditor from './RouteEditor';
import LogPanel from './LogPanel';
import ResizableSplitter from './ResizableSplitter';
import EnvironmentSettings from './EnvironmentSettings';
import DataBucketsEditor from './DataBucketsEditor';
import NewEnvironmentModal from './NewEnvironmentModal';
import RecycleBinDialog, { RestoreResult } from './RecycleBinDialog';
import { TransferResult } from './TransferDialog';
import ImportRoutesDialog, { RoutesFileSummary, RoutesImportResult, summarizeRoutesFile } from './ImportRoutesDialog';
import WarningsDialog from './shared/WarningsDialog';
import { ThemeToggle } from './ThemeToggle';
import { LogoutButton } from './LogoutButton';
import { AccountButton } from './AccountButton';
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    DatabaseIcon,
    GearIcon,
    ListUnorderedIcon,
    PlayIcon,
    ServerIcon,
    SquareFillIcon,
    SyncIcon,
    XCircleIcon,
    XIcon,
} from '@primer/octicons-react';

interface DashboardProps {
    initialEnvironments: Environment[];
    onLogout: () => Promise<void>;
}

// The server names PM2 processes after the environment file (without .json), not the display name
const envFileOf = (env: Environment) => env.filename || `${env.name}.json`;

export default function Dashboard({ initialEnvironments, onLogout }: DashboardProps) {
    const [environments, setEnvironments] = useState<Environment[]>(initialEnvironments);
    const [activeEnvId, setActiveEnvId] = useState<string>(initialEnvironments[0]?.uuid || '');
    const [activeRouteId, setActiveRouteId] = useState<string>('');
    const [activeView, setActiveView] = useState<MainView>('routes');
    const [activeLogsOpen, setActiveLogsOpen] = useState(false);
    const [activeLogsHeight, setActiveLogsHeight] = useState(250);
    const [isNewEnvModalOpen, setIsNewEnvModalOpen] = useState(false);
    const [envToDelete, setEnvToDelete] = useState<Environment | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isTrashOpen, setIsTrashOpen] = useState(false);
    const [trashCount, setTrashCount] = useState(0);
    // A routes export picked with the sidebar's JSON import, waiting for "where should they go?"
    const [routesImport, setRoutesImport] = useState<{ file: File; summary: RoutesFileSummary } | null>(null);
    const [importWarnings, setImportWarnings] = useState<{ summary: string; warnings: string[] } | null>(null);

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dismissNotification = () => {
        if (notificationTimer.current) clearTimeout(notificationTimer.current);
        notificationTimer.current = null;
        setNotification(null);
    };

    // No timer firing after sign-out
    useEffect(() => () => {
        if (notificationTimer.current) clearTimeout(notificationTimer.current);
    }, []);

    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        // A new toast restarts the timer, so an older one cannot close it early; longer messages and errors stay longer
        if (notificationTimer.current) clearTimeout(notificationTimer.current);
        const duration = Math.min(10000, Math.max(type === 'error' ? 6000 : 4000, message.length * 60));
        notificationTimer.current = setTimeout(() => {
            notificationTimer.current = null;
            setNotification(null);
        }, duration);
    };

    const handleUpdateEnvironment = (envUuid: string, updatedFields: Partial<Environment>) => {
        setEnvironments(prev => prev.map(env => {
            if (env.uuid !== envUuid) return env;
            return { ...env, ...updatedFields };
        }));
    };

    const handleUpdateRoute = (envUuid: string, routeUuid: string, updatedFields: Partial<Route>) => {
        setEnvironments(prev => prev.map(env => {
            if (env.uuid !== envUuid) return env;
            return {
                ...env,
                routes: env.routes.map(route => {
                    if (route.uuid !== routeUuid) return route;
                    return { ...route, ...updatedFields };
                })
            };
        }));
    };

    const refreshTrashCount = useCallback(() => {
        fetch('/api/environments/trash')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (data) setTrashCount(data.items.length); })
            .catch(() => { /* the count is only a hint; the dialog loads the list itself */ });
    }, []);

    useEffect(() => {
        refreshTrashCount();
    }, [refreshTrashCount]);

    const handleRestored = (result: RestoreResult) => {
        if ('target' in result) {
            // A route or folder went back into an existing environment: show it there
            const { target, name, restoredToFolder, warnings, kind, itemUuids } = result;
            const current = environments.find(env => env.filename === target.filename);
            setEnvironments(prev => prev.map(env => (env.filename === target.filename ? { ...target, uuid: env.uuid } : env)));
            if (current) setActiveEnvId(current.uuid);
            setActiveView('routes');
            setActiveRouteId(kind === 'route' ? itemUuids[0] ?? '' : '');
            const where = restoredToFolder ? '' : ' (its folder is gone, so at the top level)';
            const extra = warnings.length ? ` ${warnings.join(' ')}` : '';
            showNotification(`Restored ${name} to "${target.name}"${where}.${extra}`);
            return;
        }
        const { environment, previousPort, portChanged } = result;
        setEnvironments(prev => [...prev, environment]);
        setActiveEnvId(environment.uuid);
        setActiveRouteId('');
        showNotification(portChanged && previousPort !== null
            ? `Restored "${environment.name}" on port ${environment.port} (port ${previousPort} is not available)`
            : `Restored "${environment.name}" on port ${environment.port}`);
    };

    // An environment the server just saved (copy, move, import): replace ours, keeping the uuid the UI knows it by
    const replaceSaved = (saved: Environment) => {
        setEnvironments(prev => prev.map(env => (env.filename === saved.filename ? { ...saved, uuid: env.uuid } : env)));
    };

    const handleTransferred = (result: TransferResult) => {
        replaceSaved(result.target);
        if (result.mode === 'move') {
            replaceSaved(result.source);
            // Items are moved from the active environment; the open route may be among them
            if (activeRouteId && !result.source.routes.some(route => route.uuid === activeRouteId)) {
                setActiveRouteId('');
            }
        }
    };

    // Centralized Log Store
    const [allLogs, setAllLogs] = useState<Record<string, LogEntry[]>>({});
    const eventSources = useRef<Record<string, EventSource>>({});

    const activeEnv = useMemo(() =>
        environments.find(env => env.uuid === activeEnvId),
        [environments, activeEnvId]);

    const activeRoute = activeEnv?.routes.find(route => route.uuid === activeRouteId);

    const envFile = activeEnv ? envFileOf(activeEnv) : '';
    const processName = envFile.replace(/\.json$/, '');

    // Server Control Logic: PM2 status of every mock server, keyed by process name
    const [processStatuses, setProcessStatuses] = useState<Record<string, string>>({});
    const isRunning = processStatuses[processName] === 'online';
    const setStatus = (name: string, status: string) => setProcessStatuses(prev => ({ ...prev, [name]: status }));
    const [isServerLoading, setIsServerLoading] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('/api/action');
                const data = await res.json();
                if (data.processes) {
                    setProcessStatuses(Object.fromEntries(
                        data.processes.map((p: { name: string; status: string }) => [p.name, p.status])
                    ));
                }
            } catch (error) {
                console.error('Failed to check status', error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 10000);

        return () => clearInterval(interval);
        // Re-check right away when switching environments
    }, [activeEnv?.uuid]);

    // Per-environment status for the sidebar; no PM2 process means it was never started (stopped)
    const envStatuses = Object.fromEntries(
        environments.map(env => [env.uuid, processStatuses[envFileOf(env).replace(/\.json$/, '')] ?? 'stopped'])
    );

    const toggleServer = async () => {
        if (!activeEnv) return;
        setIsServerLoading(true);

        try {
            if (isRunning) {
                await fetch('/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'stop', name: processName })
                });
                setStatus(processName, 'stopped');
            } else {
                const res = await fetch('/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'start', file: envFile })
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to start server');
                }
                setStatus(processName, 'online');
            }
        } catch (error) {
            console.error('Action failed', error);
            showNotification(error instanceof Error ? error.message : 'Failed to toggle server state', 'error');
        } finally {
            setIsServerLoading(false);
        }
    };

    const restartServer = async () => {
        if (!activeEnv || !isRunning) return;
        setIsServerLoading(true);
        try {
            await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'stop', name: processName })
            });
            await new Promise(r => setTimeout(r, 1000));
            const res = await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'start', file: envFile })
            });
            if (!res.ok) {
                setStatus(processName, 'stopped');
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to restart server');
            }
            showNotification('Server restarted successfully');
        } catch (error) {
            showNotification(error instanceof Error ? error.message : 'Failed to restart server', 'error');
        } finally {
            setIsServerLoading(false);
        }
    };

    // Manage SSE connections in the background
    useEffect(() => {
        if (!activeEnv) return;

        const envId = activeEnv.uuid;

        if (!eventSources.current[envId]) {
            // Only real log lines count; a "Process not found" message must not make us skip the history
            const hasLogs = (allLogs[envId] || []).some(log => log.type);
            const url = `/api/logs/stream?name=${encodeURIComponent(processName)}${hasLogs ? '&skipHistory=true' : ''}`;

            const es = new EventSource(url);

            es.onmessage = (event) => {
                try {
                    const logData = JSON.parse(event.data);
                    if (!logData.type && !logData.error) return;

                    setAllLogs(prev => {
                        const currentLogs = prev[envId] || [];
                        return {
                            ...prev,
                            [envId]: [...currentLogs.slice(-99), logData]
                        };
                    });
                } catch (e) {
                    console.error('Failed to parse log entry from SSE', e, event.data);
                }
            };

            es.onerror = (e) => {
                es.close();
                delete eventSources.current[envId];
            };

            eventSources.current[envId] = es;
        }
        // isRunning: a stream opened before the server ran ends with "Process not found"; reconnect once it is up
    }, [activeEnvId, environments, isRunning]);

    useEffect(() => {
        return () => {
            Object.values(eventSources.current).forEach(es => es.close());
        };
    }, []);

    const toggleLogs = () => {
        setActiveLogsOpen(!activeLogsOpen);
    };

    const handleCreateEnvironment = async (name: string, port: number) => {
        try {
            const res = await fetch('/api/environments/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, port })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create environment');
            }

            // Add the new environment to state
            setEnvironments(prev => [...prev, data.environment]);
            setActiveEnvId(data.environment.uuid);
            showNotification(`Environment "${name}" created successfully`);
        } catch (error: any) {
            throw new Error(error.message || 'Failed to create environment');
        }
    };

    const handleRoutesImported = ({ created, target, routeCount, folderCount, warnings }: RoutesImportResult) => {
        const existing = environments.find(env => env.filename === target.filename);
        if (created || !existing) {
            setEnvironments(prev => [...prev, target]);
            setActiveEnvId(target.uuid);
        } else {
            setEnvironments(prev => prev.map(env => (env.filename === target.filename ? { ...target, uuid: env.uuid } : env)));
            setActiveEnvId(existing.uuid);
        }
        setActiveView('routes');
        setActiveRouteId('');
        const what = `${routeCount} route${routeCount === 1 ? '' : 's'}${folderCount ? ` in ${folderCount} folder${folderCount === 1 ? '' : 's'}` : ''}`;
        const summary = created
            ? `Created "${target.name}" on port ${target.port} with ${what}.`
            : `Imported ${what} into "${target.name}".`;
        if (warnings.length) setImportWarnings({ summary, warnings });
        else showNotification(summary);
    };

    const handleImportEnvironment = async (file: File) => {
        // A routes export (not a whole environment): ask where the routes should go first
        try {
            const summary = summarizeRoutesFile(JSON.parse(await file.text()));
            if (summary) {
                setRoutesImport({ file, summary });
                return;
            }
        } catch {
            // Not JSON: the server import below reports it
        }
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/environments/import', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to import environment');
            }

            // Add the imported environment to state
            setEnvironments(prev => [...prev, data.environment]);
            setActiveEnvId(data.environment.uuid);
            showNotification(`Environment "${data.environment.name}" imported successfully`);
        } catch (error: any) {
            showNotification(error.message || 'Failed to import environment', 'error');
        }
    };

    const handleDuplicateEnvironment = async (id: string) => {
        const source = environments.find(env => env.uuid === id);
        if (!source?.filename) return;
        try {
            const res = await fetch('/api/environments/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: source.filename }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to duplicate environment');
            setEnvironments(prev => [...prev, data.environment]);
            setActiveEnvId(data.environment.uuid);
            setActiveRouteId('');
            showNotification(`Duplicated as "${data.environment.name}" on port ${data.environment.port}`);
        } catch (error) {
            showNotification(error instanceof Error ? error.message : 'Failed to duplicate environment', 'error');
        }
    };

    // Downloads the saved file (what was imported or created, plus later edits) as a Mockoon environment
    const handleExportEnvironment = async (id: string) => {
        const target = environments.find(env => env.uuid === id);
        if (!target?.filename) return;
        try {
            const res = await fetch(`/api/environments/export?filename=${encodeURIComponent(target.filename)}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to export environment');
            }
            const url = URL.createObjectURL(await res.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = target.filename;
            link.click();
            // Revoke after the download has started
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            showNotification(error instanceof Error ? error.message : 'Failed to export environment', 'error');
        }
    };

    const handleDeleteEnvironment = async () => {
        if (!envToDelete) return;
        const target = envToDelete;
        setIsDeleting(true);
        try {
            const res = await fetch('/api/environments/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: target.filename || `${target.name}.json` })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete environment');
            }

            // Drop its log stream and logs, then move the selection to another environment
            eventSources.current[target.uuid]?.close();
            delete eventSources.current[target.uuid];
            setAllLogs(prev => {
                const next = { ...prev };
                delete next[target.uuid];
                return next;
            });
            const remaining = environments.filter(env => env.uuid !== target.uuid);
            setEnvironments(remaining);
            if (activeEnvId === target.uuid) {
                setActiveEnvId(remaining[0]?.uuid || '');
                setActiveRouteId('');
            }
            setEnvToDelete(null);
            refreshTrashCount();
            showNotification(`Environment "${target.name}" moved to the recycle bin`);
        } catch (error: any) {
            showNotification(error.message || 'Failed to delete environment', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleImportOpenAPI = async (file: File) => {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/environments/import-openapi', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to import OpenAPI specification');
            }

            // Add the imported environment to state
            setEnvironments(prev => [...prev, data.environment]);
            setActiveEnvId(data.environment.uuid);
            showNotification(`Imported "${data.environment.name}" with ${data.routeCount} routes from OpenAPI ${data.version}`);
        } catch (error: any) {
            showNotification(error.message || 'Failed to import OpenAPI specification', 'error');
        }
    };

    const tabs: { id: MainView; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: 'routes', label: 'Routes', icon: <ListUnorderedIcon />, count: activeEnv?.routes.length },
        { id: 'databuckets', label: 'Data Buckets', icon: <DatabaseIcon />, count: activeEnv?.data.length },
        { id: 'settings', label: 'Settings', icon: <GearIcon /> },
    ];

    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-canvas text-fg-default">
            {/* Global Header (GitHub-style app header + repository tabs) */}
            <header className="flex-shrink-0 bg-header border-b border-border-custom z-10">
                <div className="h-14 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <span className="text-fg-default flex-shrink-0"><ServerIcon size={24} /></span>
                        <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-sm">
                            <span className="hidden sm:inline text-fg-default">Mockoon</span>
                            <span className="hidden sm:inline text-fg-muted">/</span>
                            <h1 className="font-semibold text-fg-default truncate">{activeEnv?.name || 'No Environment'}</h1>
                        </nav>
                        {activeEnv && (
                            <>
                                <span
                                    className={`Label flex-shrink-0 ${isRunning ? 'text-success border-success-muted' : 'text-fg-muted'}`}
                                    title={isRunning ? 'Running' : 'Stopped'}
                                >
                                    <span className={`w-2 h-2 rounded-full sm:mr-1.5 ${isRunning ? 'bg-success' : 'bg-fg-subtle'}`} />
                                    {/* Only the dot on phones */}
                                    <span className="hidden sm:inline">{isRunning ? 'Running' : 'Stopped'}</span>
                                    <span className="sr-only sm:hidden">{isRunning ? 'Running' : 'Stopped'}</span>
                                </span>
                                <span className="hidden md:inline text-xs text-fg-muted font-mono">localhost:{activeEnv.port}</span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <button
                            onClick={toggleServer}
                            disabled={isServerLoading || !activeEnv}
                            className={`btn btn-sm ${isRunning ? 'btn-danger' : 'btn-primary'}`}
                            title={isRunning ? 'Stop server' : 'Start server'}
                        >
                            {isRunning ? <SquareFillIcon size={12} /> : <PlayIcon />}
                            {isRunning ? 'Stop' : 'Start'}
                        </button>
                        <button
                            onClick={restartServer}
                            disabled={!isRunning || isServerLoading}
                            className="btn btn-sm"
                            title="Restart server"
                            aria-label="Restart server"
                        >
                            <SyncIcon className={isServerLoading ? 'animate-spin' : undefined} />
                            <span className="hidden sm:inline">Restart</span>
                        </button>
                        <div className="hidden sm:block h-5 w-px bg-border-custom mx-1" />
                        <ThemeToggle />
                        <AccountButton notify={showNotification} />
                        <LogoutButton onLogout={onLogout} />
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="UnderlineNav px-2 sm:px-4 min-h-0 h-12 overflow-x-auto overflow-y-hidden" aria-label="Environment">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveView(tab.id)}
                            className={`UnderlineNav-item ${activeView === tab.id ? 'is-selected' : ''}`}
                            aria-current={activeView === tab.id ? 'page' : undefined}
                        >
                            <span className="UnderlineNav-inner">
                                {tab.icon}
                                {tab.label}
                                {tab.count !== undefined && <span className="Counter">{tab.count}</span>}
                            </span>
                        </button>
                    ))}
                </nav>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar: Environments */}
                <Sidebar
                    environments={environments}
                    activeEnvId={activeEnvId}
                    onSelectEnv={setActiveEnvId}
                    onAddEnv={() => setIsNewEnvModalOpen(true)}
                    onImportEnv={handleImportEnvironment}
                    onImportOpenAPI={handleImportOpenAPI}
                    envStatuses={envStatuses}
                    onExportEnv={handleExportEnvironment}
                    onDeleteEnv={(id) => setEnvToDelete(environments.find(env => env.uuid === id) || null)}
                    onDuplicateEnv={handleDuplicateEnvironment}
                    onOpenTrash={() => setIsTrashOpen(true)}
                    trashCount={trashCount}
                />

                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Pane 2: Section Navigation (e.g. Route List) */}
                    {activeView === 'routes' && (
                        <RouteList
                            activeEnv={activeEnv}
                            envFilename={activeEnv?.filename}
                            activeRouteId={activeRouteId}
                            onSelectRoute={setActiveRouteId}
                            onRouteCreated={(newRoute, hierarchy) => {
                                if (activeEnvId) {
                                    setEnvironments(prev => prev.map(env =>
                                        env.uuid === activeEnvId
                                            ? { ...env, ...hierarchy, routes: [...env.routes, newRoute] }
                                            : env
                                    ));
                                }
                            }}
                            onHierarchyChange={(hierarchy) => {
                                if (activeEnvId) handleUpdateEnvironment(activeEnvId, hierarchy);
                            }}
                            onRouteDeleted={(routeUuid) => {
                                // The route went to the recycle bin
                                refreshTrashCount();
                                if (activeEnvId) {
                                    setEnvironments(prev => prev.map(env =>
                                        env.uuid === activeEnvId
                                            ? {
                                                ...env,
                                                routes: env.routes.filter(r => r.uuid !== routeUuid),
                                                rootChildren: env.rootChildren.filter(c => c.uuid !== routeUuid),
                                                folders: env.folders.map(f => ({
                                                    ...f,
                                                    children: f.children.filter(c => c.uuid !== routeUuid),
                                                })),
                                            }
                                            : env
                                    ));
                                    if (activeRouteId === routeUuid) {
                                        setActiveRouteId('');
                                    }
                                }
                            }}
                            notify={showNotification}
                            environments={environments}
                            onTransferred={handleTransferred}
                            onEnvironmentSaved={replaceSaved}
                            className={activeRoute ? 'hidden md:flex' : 'flex'}
                        />
                    )}

                    {/* Pane 3: Main Editor Screen (on phones only once a route is open) */}
                    <div className={`flex-1 flex-col min-w-0 overflow-hidden ${activeView === 'routes' && !activeRoute ? 'hidden md:flex' : 'flex'}`}>
                        {activeView === 'routes' && activeRoute && (
                            <div className="md:hidden flex items-center gap-2 px-2 h-10 border-b border-border-muted bg-canvas-muted flex-shrink-0">
                                <button onClick={() => setActiveRouteId('')} className="btn btn-sm btn-invisible">
                                    <ArrowLeftIcon />
                                    Routes
                                </button>
                                <span className="min-w-0 truncate text-xs font-mono text-fg-muted">
                                    {(activeRoute.method || activeRoute.type).toUpperCase()} /{activeRoute.endpoint.replace(/^\//, '')}
                                </span>
                            </div>
                        )}
                        <ResizableSplitter
                            isVertical={true}
                            initialSize={250}
                            minSize={activeLogsOpen ? 150 : 32}
                            primaryPane="second"
                            size={activeLogsOpen ? activeLogsHeight : 32}
                            onResize={setActiveLogsHeight}
                        >
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {activeView === 'routes' && (
                                    <RouteEditor
                                        route={activeRoute}
                                        envFilename={activeEnv?.filename}
                                        onSave={(updatedFields) => {
                                            if (activeEnv && activeRoute) {
                                                handleUpdateRoute(activeEnv.uuid, activeRoute.uuid, updatedFields);
                                            }
                                        }}
                                        notify={showNotification}
                                    />
                                )}
                                {activeView === 'settings' && activeEnv && (
                                    <EnvironmentSettings
                                        environment={activeEnv}
                                        onSave={(updates) => handleUpdateEnvironment(activeEnv.uuid, updates)}
                                        notify={showNotification}
                                        onDelete={() => setEnvToDelete(activeEnv)}
                                    />
                                )}
                                {activeView === 'databuckets' && activeEnv && (
                                    <DataBucketsEditor
                                        environment={activeEnv}
                                        onUpdate={(updates) => handleUpdateEnvironment(activeEnv.uuid, updates)}
                                        notify={showNotification}
                                    />
                                )}
                            </div>

                            <LogPanel
                                envName={activeEnv?.name}
                                isOpen={activeLogsOpen}
                                onToggle={toggleLogs}
                                logEntries={activeEnv ? (allLogs[activeEnv.uuid] || []) : []}
                            />
                        </ResizableSplitter>
                    </div>
                </div>
            </div>

            {/* Global Notifications (Primer toast) */}
            {notification && (
                <div
                    role={notification.type === 'error' ? 'alert' : 'status'}
                    className="Overlay fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto z-50 flex items-stretch overflow-hidden rounded-md sm:max-w-md"
                >
                    <div className={`flex items-center px-3 text-white flex-shrink-0 ${notification.type === 'success' ? 'bg-success-emphasis' : 'bg-danger-emphasis'}`}>
                        {notification.type === 'success' ? <CheckCircleIcon /> : <XCircleIcon />}
                    </div>
                    <div className="flex-1 min-w-0 pl-4 pr-1 py-3 text-sm text-fg-default break-words">{notification.message}</div>
                    <div className="flex items-start p-2 flex-shrink-0">
                        <button onClick={dismissNotification} className="btn btn-invisible btn-icon btn-sm" aria-label="Dismiss notification" title="Dismiss">
                            <XIcon />
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Environment Dialog */}
            {envToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => !isDeleting && setEnvToDelete(null)} />
                    <div role="dialog" aria-modal="true" aria-labelledby="delete-env-title" className="Overlay relative w-full max-w-md mx-4">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                            <h2 id="delete-env-title" className="text-sm font-semibold text-fg-default">Delete {envToDelete.name}</h2>
                            <button onClick={() => setEnvToDelete(null)} disabled={isDeleting} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                                <XIcon />
                            </button>
                        </div>
                        <div className="p-4 space-y-3 text-sm">
                            <div className="flash flash-warn text-[13px]">
                                Its mock server (port {envToDelete.port}) will be stopped and removed from PM2.
                            </div>
                            <p className="text-fg-muted">
                                It is moved to the <strong className="text-fg-default">Recycle bin</strong> (bottom of the sidebar),
                                where it can be restored or deleted permanently.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                            <button onClick={() => setEnvToDelete(null)} disabled={isDeleting} className="btn btn-sm">
                                Cancel
                            </button>
                            <button onClick={handleDeleteEnvironment} disabled={isDeleting} className="btn btn-sm btn-danger-solid" autoFocus>
                                {isDeleting ? 'Deleting…' : 'Delete environment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {routesImport && (
                <ImportRoutesDialog
                    file={routesImport.file}
                    summary={routesImport.summary}
                    environments={environments}
                    activeFilename={activeEnv?.filename}
                    onClose={() => setRoutesImport(null)}
                    onImported={handleRoutesImported}
                />
            )}

            {importWarnings && (
                <WarningsDialog
                    title="Import finished"
                    summary={importWarnings.summary}
                    warnings={importWarnings.warnings}
                    onClose={() => setImportWarnings(null)}
                />
            )}

            {isTrashOpen && (
                <RecycleBinDialog
                    environments={environments}
                    onClose={() => setIsTrashOpen(false)}
                    onRestored={handleRestored}
                    onCountChange={setTrashCount}
                    notify={showNotification}
                />
            )}

            {/* New Environment Modal */}
            <NewEnvironmentModal
                isOpen={isNewEnvModalOpen}
                onClose={() => setIsNewEnvModalOpen(false)}
                onCreate={handleCreateEnvironment}
            />
        </div>
    );
}
