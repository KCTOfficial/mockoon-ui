import { Environment } from '@/types/mockoon';
import { useState } from 'react';
import { FileDirectoryIcon, PlusIcon, SearchIcon, TrashIcon, TriangleDownIcon } from '@primer/octicons-react';
import ConfirmDialog from './shared/ConfirmDialog';

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
    get: 'text-get border-get/40',
    post: 'text-post border-post/40',
    put: 'text-put border-put/40',
    delete: 'text-delete border-delete/40',
    patch: 'text-patch border-patch/40',
};

export default function RouteList({ activeEnv, envFilename, activeRouteId, onSelectRoute, onRouteCreated, onRouteDeleted, notify }: RouteListProps) {
    const [filter, setFilter] = useState('');
    const [routeToDelete, setRouteToDelete] = useState<Environment['routes'][number] | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);

    const filteredRoutes = activeEnv?.routes.filter(r =>
        r.endpoint.toLowerCase().includes(filter.toLowerCase()) ||
        r.method.toLowerCase().includes(filter.toLowerCase())
    );

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

    const handleDeleteRoute = async (routeUuid: string) => {
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
                setRouteToDelete(null);
                if (onRouteDeleted) onRouteDeleted(routeUuid);
                if (notify) notify('Route deleted', 'success');
            } else if (notify) {
                notify('Error deleting route', 'error');
            }
        } catch (error: any) {
            if (notify) notify('Error deleting route', 'error');
        }
    };

    return (
        <div className="w-80 flex-shrink-0 bg-canvas border-r border-border-custom flex flex-col overflow-hidden">
            {/* Filter Header */}
            <div className="p-3 border-b border-border-custom bg-canvas-muted space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-fg-default">Routes</h3>
                        <span className="Counter">{activeEnv?.routes.length ?? 0}</span>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            disabled={isCreating || !activeEnv}
                            className="btn btn-sm"
                            title="Add new"
                            aria-haspopup="menu"
                            aria-expanded={showAddMenu}
                        >
                            {isCreating ? (
                                <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <PlusIcon />
                            )}
                            <TriangleDownIcon />
                        </button>
                        {/* Dropdown Menu */}
                        {showAddMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                                <div role="menu" className="Overlay absolute right-0 top-full mt-1 z-50 p-2 min-w-[200px]">
                                    <button role="menuitem" onClick={() => handleCreateRoute('http')} className="ActionList-item">
                                        <span className="Label text-get border-get/40 !h-[18px] !px-1.5 text-[10px]">HTTP</span> HTTP route
                                    </button>
                                    <button role="menuitem" onClick={() => handleCreateRoute('crud')} className="ActionList-item">
                                        <span className="Label text-post border-post/40 !h-[18px] !px-1.5 text-[10px]">CRUD</span> CRUD route
                                    </button>
                                    <button role="menuitem" onClick={() => handleCreateRoute('ws')} className="ActionList-item">
                                        <span className="Label text-patch border-patch/40 !h-[18px] !px-1.5 text-[10px]">WS</span> WebSocket
                                    </button>
                                    <div className="border-t border-border-muted my-2 -mx-2" />
                                    <button role="menuitem" onClick={handleCreateFolder} className="ActionList-item">
                                        <FileDirectoryIcon /> Folder
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Filter Input */}
                <label className="form-control form-control-sm flex items-center gap-2 w-full !py-0">
                    <SearchIcon size={14} className="text-fg-muted flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Filter routes"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="flex-1 min-w-0 bg-transparent outline-none text-xs text-fg-default placeholder:text-fg-subtle"
                    />
                </label>
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto">
                {filteredRoutes?.map((route) => {
                    const isActive = activeRouteId === route.uuid;
                    return (
                        <div
                            key={route.uuid}
                            onClick={() => onSelectRoute(route.uuid)}
                            className={`
                                group relative px-3 py-2 cursor-pointer border-b border-border-muted flex items-center justify-between gap-3
                                ${isActive ? 'bg-accent-subtle' : 'hover:bg-canvas-muted'}
                            `}
                        >
                            {isActive && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`Label !h-[18px] !px-1.5 text-[10px] font-semibold uppercase font-mono w-14 justify-center flex-shrink-0 ${methodColors[route.method.toLowerCase()] || 'text-fg-muted'}`}>
                                    {route.method || route.type}
                                </span>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-[13px] truncate font-mono ${isActive ? 'text-fg-default font-semibold' : 'text-fg-default'}`}>
                                        {route.endpoint.startsWith('/') ? route.endpoint : `/${route.endpoint}`}
                                    </span>
                                    <span className="text-xs text-fg-muted truncate">{route.responses[0]?.label || 'Route response'}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRouteToDelete(route);
                                    }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:!text-danger"
                                    title="Delete route"
                                    aria-label="Delete route"
                                >
                                    <TrashIcon size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {(!activeEnv || activeEnv.routes.length === 0) && (
                    <div className="p-8 text-center text-sm text-fg-muted">
                        No routes found
                    </div>
                )}
            </div>

            {routeToDelete && (
                <ConfirmDialog
                    title="Delete route"
                    confirmLabel="Delete route"
                    onConfirm={() => handleDeleteRoute(routeToDelete.uuid)}
                    onCancel={() => setRouteToDelete(null)}
                >
                    Delete{' '}
                    <code className="font-mono text-fg-default">
                        {(routeToDelete.method || routeToDelete.type).toUpperCase()} /{routeToDelete.endpoint.replace(/^\//, '')}
                    </code>{' '}
                    and its {routeToDelete.responses.length} response(s)? This cannot be undone.
                </ConfirmDialog>
            )}
        </div>
    );
}
