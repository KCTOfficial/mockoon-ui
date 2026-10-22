import { useState, useEffect, useRef, useMemo } from 'react';
import { Environment, Route, LogEntry } from '@/types/mockoon';
import Sidebar, { MainView } from './Sidebar';
import RouteList from './RouteList';
import RouteEditor from './RouteEditor';
import LogPanel from './LogPanel';
import ResizableSplitter from './ResizableSplitter';
import EnvironmentSettings from './EnvironmentSettings';
import DataBucketsEditor from './DataBucketsEditor';
import NewEnvironmentModal from './NewEnvironmentModal';
import { ThemeToggle } from './ThemeToggle';
import { LogoutButton } from './LogoutButton';
import {
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

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
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

    // Centralized Log Store
    const [allLogs, setAllLogs] = useState<Record<string, LogEntry[]>>({});
    const eventSources = useRef<Record<string, EventSource>>({});

    const activeEnv = useMemo(() =>
        environments.find(env => env.uuid === activeEnvId),
        [environments, activeEnvId]);

    const activeRoute = activeEnv?.routes.find(route => route.uuid === activeRouteId);

    // The server names PM2 processes after the environment file (without .json), not the display name
    const envFile = activeEnv ? (activeEnv.filename || `${activeEnv.name}.json`) : '';
    const processName = envFile.replace(/\.json$/, '');

    // Server Control Logic
    const [isRunning, setIsRunning] = useState(false);
    const [isServerLoading, setIsServerLoading] = useState(false);

    useEffect(() => {
        if (!activeEnv) return;

        const checkStatus = async () => {
            try {
                const res = await fetch('/api/action');
                const data = await res.json();
                if (data.processes) {
                    const isEnvRunning = data.processes.some((p: any) => p.name === processName && p.status === 'online');
                    setIsRunning(isEnvRunning);
                }
            } catch (error) {
                console.error('Failed to check status', error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 10000);

        return () => clearInterval(interval);
    }, [activeEnv?.uuid, processName]);

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
                setIsRunning(false);
            } else {
                await fetch('/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'start', file: envFile })
                });
                setIsRunning(true);
            }
        } catch (error) {
            console.error('Action failed', error);
            showNotification('Failed to toggle server state', 'error');
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
            await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'start', file: envFile })
            });
            showNotification('Server restarted successfully');
        } catch (error) {
            showNotification('Failed to restart server', 'error');
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

    const handleImportEnvironment = async (file: File) => {
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
            showNotification(`Environment "${target.name}" deleted`);
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
                <div className="h-14 flex items-center justify-between gap-4 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-fg-default flex-shrink-0"><ServerIcon size={24} /></span>
                        <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-sm">
                            <span className="text-fg-default">Mockoon</span>
                            <span className="text-fg-muted">/</span>
                            <h1 className="font-semibold text-fg-default truncate">{activeEnv?.name || 'No Environment'}</h1>
                        </nav>
                        {activeEnv && (
                            <>
                                <span className={`Label ${isRunning ? 'text-success border-success-muted' : 'text-fg-muted'}`}>
                                    <span className={`w-2 h-2 rounded-full mr-1.5 ${isRunning ? 'bg-success' : 'bg-fg-subtle'}`} />
                                    {isRunning ? 'Running' : 'Stopped'}
                                </span>
                                <span className="hidden md:inline text-xs text-fg-muted font-mono">localhost:{activeEnv.port}</span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
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
                        >
                            <SyncIcon className={isServerLoading ? 'animate-spin' : undefined} />
                            Restart
                        </button>
                        <div className="h-5 w-px bg-border-custom mx-1" />
                        <ThemeToggle />
                        <LogoutButton onLogout={onLogout} />
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="UnderlineNav px-4 min-h-0 h-12" aria-label="Environment">
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
                    onDeleteEnv={(id) => setEnvToDelete(environments.find(env => env.uuid === id) || null)}
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
                            onRouteCreated={(newRoute) => {
                                if (activeEnvId) {
                                    setEnvironments(prev => prev.map(env =>
                                        env.uuid === activeEnvId
                                            ? { ...env, routes: [...env.routes, newRoute] }
                                            : env
                                    ));
                                }
                            }}
                            onRouteDeleted={(routeUuid) => {
                                if (activeEnvId) {
                                    setEnvironments(prev => prev.map(env =>
                                        env.uuid === activeEnvId
                                            ? { ...env, routes: env.routes.filter(r => r.uuid !== routeUuid) }
                                            : env
                                    ));
                                    if (activeRouteId === routeUuid) {
                                        setActiveRouteId('');
                                    }
                                }
                            }}
                            notify={showNotification}
                        />
                    )}

                    {/* Pane 3: Main Editor Screen */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
                    role="status"
                    className="Overlay fixed bottom-6 left-6 z-50 flex items-stretch overflow-hidden rounded-md max-w-md"
                >
                    <div className={`flex items-center px-3 text-white ${notification.type === 'success' ? 'bg-success-emphasis' : 'bg-danger-emphasis'}`}>
                        {notification.type === 'success' ? <CheckCircleIcon /> : <XCircleIcon />}
                    </div>
                    <div className="px-4 py-3 text-sm text-fg-default">{notification.message}</div>
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
                                The file <code className="font-mono text-fg-default">{envToDelete.filename}</code> is moved to{' '}
                                <code className="font-mono text-fg-default">data/.deleted/</code>, so it can still be restored from the server.
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

            {/* New Environment Modal */}
            <NewEnvironmentModal
                isOpen={isNewEnvModalOpen}
                onClose={() => setIsNewEnvModalOpen(false)}
                onCreate={handleCreateEnvironment}
            />
        </div>
    );
}
