'use client';

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

interface DashboardProps {
    initialEnvironments: Environment[];
}

export default function Dashboard({ initialEnvironments }: DashboardProps) {
    const [environments, setEnvironments] = useState<Environment[]>(initialEnvironments);
    const [activeEnvId, setActiveEnvId] = useState<string>(initialEnvironments[0]?.uuid || '');
    const [activeRouteId, setActiveRouteId] = useState<string>('');
    const [activeView, setActiveView] = useState<MainView>('routes');
    const [activeLogsOpen, setActiveLogsOpen] = useState(false);
    const [activeLogsHeight, setActiveLogsHeight] = useState(250);
    const [isNewEnvModalOpen, setIsNewEnvModalOpen] = useState(false);

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
                    const isEnvRunning = data.processes.some((p: any) => p.name === activeEnv.name && p.status === 'online');
                    setIsRunning(isEnvRunning);
                }
            } catch (error) {
                console.error('Failed to check status', error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 10000);

        return () => clearInterval(interval);
    }, [activeEnv?.uuid, activeEnv?.name]);

    const toggleServer = async () => {
        if (!activeEnv) return;
        setIsServerLoading(true);

        try {
            if (isRunning) {
                await fetch('/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'stop', name: activeEnv.name })
                });
                setIsRunning(false);
            } else {
                await fetch('/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'start', file: activeEnv.filename || `${activeEnv.name}.json` })
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
                body: JSON.stringify({ command: 'stop', name: activeEnv.name })
            });
            await new Promise(r => setTimeout(r, 1000));
            await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'start', file: activeEnv.filename || `${activeEnv.name}.json` })
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
        const envName = activeEnv.name;

        if (!eventSources.current[envId]) {
            const hasLogs = allLogs[envId] && allLogs[envId].length > 0;
            const url = `/api/logs/stream?name=${encodeURIComponent(envName)}${hasLogs ? '&skipHistory=true' : ''}`;

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
    }, [activeEnvId, environments]);

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

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            {/* Sidebar: Environments Only */}
            <Sidebar
                environments={environments}
                activeEnvId={activeEnvId}
                onSelectEnv={setActiveEnvId}
                onAddEnv={() => setIsNewEnvModalOpen(true)}
                onImportEnv={handleImportEnvironment}
                onImportOpenAPI={handleImportOpenAPI}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Global Header */}
                <header className="h-14 border-b border-border-custom bg-sidebar/50 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        {/* Environment Title with Server Controls */}
                        <div className="flex items-center gap-3">
                            <h1 className="text-sm font-bold text-text-primary leading-none">{activeEnv?.name || 'No Environment'}</h1>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                                <span className="text-[10px] text-text-muted font-mono">localhost:{activeEnv?.port}</span>
                            </div>

                            {/* Server Controls - Next to title */}
                            <div className="flex items-center gap-1 ml-2">
                                <button
                                    onClick={toggleServer}
                                    disabled={isServerLoading || !activeEnv}
                                    className={`p-1.5 rounded transition-colors ${isServerLoading ? 'opacity-50' : isRunning ? 'text-red-500 hover:bg-red-500/10' : 'text-green-500 hover:bg-green-500/10'}`}
                                    title={isRunning ? "Stop server" : "Start server"}
                                >
                                    {isRunning ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={restartServer}
                                    disabled={!isRunning || isServerLoading}
                                    className={`p-1.5 rounded transition-colors ${(!isRunning || isServerLoading) ? 'text-text-disabled' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}
                                    title="Restart server"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-border-custom mx-2" />

                        {/* Navigation Tabs */}
                        <nav className="flex items-center bg-surface/50 p-1 rounded-lg border border-border-custom/50">
                            {[
                                { id: 'routes', label: 'Routes', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
                                { id: 'databuckets', label: 'Data Buckets', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" /><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" /><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" /></svg> },
                                { id: 'settings', label: 'Settings', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveView(tab.id as MainView)}
                                    className={`
                                        flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all
                                        ${activeView === tab.id
                                            ? 'bg-accent text-white shadow-sm'
                                            : 'text-text-secondary hover:text-text-primary hover:bg-hover'}
                                    `}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                    </div>
                </header>

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

                {/* Global Notifications */}
                {notification && (
                    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${notification.type === 'success'
                        ? 'bg-accent text-white border border-white/20'
                        : 'bg-red-500 text-white'
                        }`}>
                        {notification.type === 'success' ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        <span className="font-medium">{notification.message}</span>
                    </div>
                )}
            </div>

            {/* New Environment Modal */}
            <NewEnvironmentModal
                isOpen={isNewEnvModalOpen}
                onClose={() => setIsNewEnvModalOpen(false)}
                onCreate={handleCreateEnvironment}
            />
        </div>
    );
}
