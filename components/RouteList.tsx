'use client';

import { Environment } from '@/types/mockoon';
import { useState, useEffect } from 'react';

interface RouteListProps {
    activeEnv?: Environment;
    envFilename?: string;
    activeRouteId: string;
    onSelectRoute: (id: string) => void;
    onRouteCreated?: (newRoute: any) => void;
    onRouteDeleted?: (routeUuid: string) => void;
    notify?: (message: string, type: 'success' | 'error') => void;
}

const methodColors: Record<string, string> = {
    get: 'text-get border-get bg-get/10',
    post: 'text-post border-post bg-post/10',
    put: 'text-put border-put bg-put/10',
    delete: 'text-delete border-delete bg-delete/10',
    patch: 'text-patch border-patch bg-patch/10',
};

export default function RouteList({ activeEnv, envFilename, activeRouteId, onSelectRoute, onRouteCreated, onRouteDeleted, notify }: RouteListProps) {
    const [filter, setFilter] = useState('');
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);

    const filteredRoutes = activeEnv?.routes.filter(r =>
        r.endpoint.toLowerCase().includes(filter.toLowerCase()) ||
        r.method.toLowerCase().includes(filter.toLowerCase())
    );

    // Auto-reset confirmation state after 3 seconds
    useEffect(() => {
        if (confirmingId) {
            const timer = setTimeout(() => setConfirmingId(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmingId]);

    const handleCreateRoute = async (routeType: string = 'http') => {
        if (!envFilename) return;
        setIsCreating(true);
        setShowAddMenu(false);
        try {
            const res = await fetch('/api/environments/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    action: 'create',
                    routeType
                })
            });
            const data = await res.json();
            if (data.success) {
                if (onRouteCreated) onRouteCreated(data.route);
                onSelectRoute(data.route.uuid);
                const typeNames: Record<string, string> = {
                    http: 'HTTP route',
                    crud: 'CRUD route',
                    ws: 'WebSocket route'
                };
                if (notify) notify(`${typeNames[routeType] || 'Route'} created`, 'success');
            }
        } catch (error: any) {
            if (notify) notify('Error creating route', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!envFilename) return;
        setIsCreating(true);
        try {
            const res = await fetch('/api/environments/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    action: 'create',
                    folder: { name: 'New folder' }
                })
            });
            const data = await res.json();
            if (data.success) {
                if (notify) notify('Folder created', 'success');
                // Refresh the environment
                if (onRouteCreated) onRouteCreated({ type: 'folder', uuid: data.folder.uuid });
            }
        } catch (error: any) {
            if (notify) notify('Error creating folder', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteRoute = async (e: React.MouseEvent, routeUuid: string) => {
        e.stopPropagation();

        if (confirmingId !== routeUuid) {
            setConfirmingId(routeUuid);
            return;
        }

        if (!envFilename) return;

        try {
            const res = await fetch('/api/environments/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    action: 'delete',
                    routeUuid
                })
            });
            if (res.ok) {
                setConfirmingId(null);
                if (onRouteDeleted) onRouteDeleted(routeUuid);
                if (notify) notify('Route deleted', 'success');
            }
        } catch (error: any) {
            if (notify) notify('Error deleting route', 'error');
        }
    };

    return (
        <div className="w-80 flex-shrink-0 bg-middle border-r border-border-custom flex flex-col overflow-hidden">
            {/* Filter Header */}
            <div className="p-4 border-b border-border-custom bg-sidebar/30">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Routes</h3>
                    <div className="relative">
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            disabled={isCreating}
                            className="text-text-secondary hover:text-text-primary transition-colors p-1 hover:bg-hover rounded"
                            title="Add new"
                        >
                            {isCreating ? (
                                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                        </button>
                        {/* Dropdown Menu */}
                        {showAddMenu && (
                            <div className="absolute right-0 top-full mt-1 bg-surface border border-border-custom rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
                                <button
                                    onClick={() => handleCreateRoute('http')}
                                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-hover hover:text-text-primary flex items-center gap-2"
                                >
                                    <span className="text-get font-bold">+</span> HTTP Route
                                </button>
                                <button
                                    onClick={() => handleCreateRoute('crud')}
                                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-hover hover:text-text-primary flex items-center gap-2"
                                >
                                    <span className="text-post font-bold">+</span> CRUD Route
                                </button>
                                <button
                                    onClick={() => handleCreateRoute('ws')}
                                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-hover hover:text-text-primary flex items-center gap-2"
                                >
                                    <span className="text-purple-400 font-bold">∞</span> WebSocket
                                </button>
                                <div className="border-t border-border-custom my-1" />
                                <button
                                    onClick={handleCreateFolder}
                                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-hover hover:text-text-primary flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                    Folder
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Input */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter routes..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full bg-input border border-border-custom rounded pl-8 pr-3 py-1.5 text-xs text-text-primary focus:ring-1 focus:ring-accent focus:border-accent outline-none placeholder-text-muted"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto">
                {filteredRoutes?.map((route) => (
                    <div
                        key={route.uuid}
                        onClick={() => onSelectRoute(route.uuid)}
                        className={`
              group px-4 py-3 cursor-pointer border-b border-border-custom/30 flex items-center justify-between gap-3 transition-colors
              ${activeRouteId === route.uuid ? 'bg-active border-transparent shadow-inner' : 'hover:bg-hover border-transparent'}
            `}
                    >
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-sm truncate font-medium ${activeRouteId === route.uuid ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>
                                {route.endpoint.startsWith('/') ? route.endpoint : `/${route.endpoint}`}
                            </span>
                            <span className="text-[10px] text-text-muted truncate">{route.responses[0]?.label || 'Route response'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className={`
                text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border leading-none
                ${methodColors[route.method.toLowerCase()] || 'text-text-secondary border-border-custom'}
              `}>
                                {route.method}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {confirmingId === route.uuid ? (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmingId(null);
                                            }}
                                            className="p-1 text-text-secondary hover:text-text-primary hover:bg-hover rounded transition-all"
                                            title="Cancel deletion"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteRoute(e, route.uuid)}
                                            className="p-1 bg-red-500 text-white rounded hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
                                            title="Confirm deletion"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={(e) => handleDeleteRoute(e, route.uuid)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                                        title="Delete route"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {(!activeEnv || activeEnv.routes.length === 0) && (
                    <div className="p-8 text-center text-sm text-text-muted">
                        No routes found
                    </div>
                )}
            </div>
        </div>
    );
}
