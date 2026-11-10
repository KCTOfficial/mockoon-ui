import { Environment, Folder, FolderChild, Route } from '@/types/mockoon';
import { useMemo, useRef, useState } from 'react';
import {
    ChevronDownIcon,
    ChevronRightIcon,
    FileDirectoryIcon,
    FileDirectoryOpenFillIcon,
    MoveToEndIcon,
    PencilIcon,
    PlusIcon,
    SearchIcon,
    TrashIcon,
    TriangleDownIcon,
} from '@primer/octicons-react';
import ConfirmDialog from './shared/ConfirmDialog';

export interface Hierarchy {
    folders: Folder[];
    rootChildren: FolderChild[];
}

interface RouteListProps {
    activeEnv?: Environment;
    envFilename?: string;
    activeRouteId: string;
    onSelectRoute: (id: string) => void;
    onRouteCreated?: (newRoute: Route, hierarchy?: Hierarchy) => void;
    onRouteDeleted?: (routeUuid: string) => void;
    /** Folders or the tree changed on the server; replaces the environment's copy */
    onHierarchyChange?: (hierarchy: Hierarchy) => void;
    notify?: (message: string, type: 'success' | 'error') => void;
}

type Item = { type: 'route' | 'folder'; uuid: string };

/** A dropdown pinned to the button that opened it, so the scrolling list never clips it. */
type Anchor = { top?: number; bottom?: number; right: number };
type Menu =
    | ({ kind: 'add'; parentFolderUuid: string | null } & Anchor)
    | ({ kind: 'move'; item: Item } & Anchor);

const methodColors: Record<string, string> = {
    get: 'text-get border-get/40',
    post: 'text-post border-post/40',
    put: 'text-put border-put/40',
    delete: 'text-delete border-delete/40',
    patch: 'text-patch border-patch/40',
};

const ROUTE_TYPE_NAMES: Record<string, string> = { http: 'HTTP route', crud: 'CRUD route', ws: 'WebSocket route' };

const DRAG_TYPE = 'application/x-mockoon-item';

const menuAt = (button: HTMLElement): Anchor => {
    const rect = button.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    // In the lower part of the window, open upwards so the menu stays on screen
    return rect.bottom > window.innerHeight * 0.6
        ? { bottom: window.innerHeight - rect.top + 4, right }
        : { top: rect.bottom + 4, right };
};

export default function RouteList({
    activeEnv,
    envFilename,
    activeRouteId,
    onSelectRoute,
    onRouteCreated,
    onRouteDeleted,
    onHierarchyChange,
    notify,
}: RouteListProps) {
    const [filter, setFilter] = useState('');
    const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
    const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [renaming, setRenaming] = useState<{ uuid: string; name: string } | null>(null);
    // Set by Escape, so the blur that follows does not save the edit
    const renameCancelled = useRef(false);
    const [dragItem, setDragItem] = useState<Item | null>(null);
    // Folder uuid being hovered while dragging; 'root' for the list background
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    const routes = useMemo(() => activeEnv?.routes ?? [], [activeEnv?.routes]);
    const folders = useMemo(() => activeEnv?.folders ?? [], [activeEnv?.folders]);

    const routesById = useMemo(() => new Map(routes.map(r => [r.uuid, r])), [routes]);
    const foldersById = useMemo(() => new Map(folders.map(f => [f.uuid, f])), [folders]);

    // Routes missing from the tree (e.g. just created by an older client) are shown at the root, as Mockoon does
    const rootChildren = useMemo(() => {
        const referenced = new Set<string>();
        (activeEnv?.rootChildren ?? []).forEach(c => referenced.add(c.uuid));
        folders.forEach(f => f.children.forEach(c => referenced.add(c.uuid)));
        const orphans: FolderChild[] = routes.filter(r => !referenced.has(r.uuid)).map(r => ({ type: 'route', uuid: r.uuid }));
        return [...(activeEnv?.rootChildren ?? []), ...orphans];
    }, [activeEnv?.rootChildren, folders, routes]);

    const query = filter.trim().toLowerCase();
    const routeMatches = (route: Route) =>
        !query || route.endpoint.toLowerCase().includes(query) || (route.method || route.type).toLowerCase().includes(query);

    /** While filtering, a folder stays visible when its name or anything inside it matches. */
    const folderVisible = (folder: Folder, seen = new Set<string>()): boolean => {
        if (!query || folder.name.toLowerCase().includes(query)) return true;
        if (seen.has(folder.uuid)) return false;
        seen.add(folder.uuid);
        return folder.children.some(c => {
            if (c.type === 'route') {
                const route = routesById.get(c.uuid);
                return !!route && routeMatches(route);
            }
            const child = foldersById.get(c.uuid);
            return !!child && folderVisible(child, seen);
        });
    };

    const countRoutes = (folder: Folder, seen = new Set<string>()): number => {
        if (seen.has(folder.uuid)) return 0;
        seen.add(folder.uuid);
        return folder.children.reduce((sum, c) => {
            if (c.type === 'route') return sum + (routesById.has(c.uuid) ? 1 : 0);
            const child = foldersById.get(c.uuid);
            return sum + (child ? countRoutes(child, seen) : 0);
        }, 0);
    };

    /** Folders an item may move into: every folder except a moved folder itself and its subfolders. */
    const moveTargets = (item: Item): { folder: Folder; depth: number }[] => {
        const result: { folder: Folder; depth: number }[] = [];
        const walk = (children: FolderChild[], depth: number, seen: Set<string>) => {
            children.forEach(c => {
                if (c.type !== 'folder' || seen.has(c.uuid)) return;
                if (item.type === 'folder' && c.uuid === item.uuid) return;
                const folder = foldersById.get(c.uuid);
                if (!folder) return;
                seen.add(c.uuid);
                result.push({ folder, depth });
                walk(folder.children, depth + 1, seen);
            });
        };
        walk(rootChildren, 0, new Set());
        return result;
    };

    const parentOf = (uuid: string): string | null =>
        folders.find(f => f.children.some(c => c.uuid === uuid))?.uuid ?? null;

    const post = async (url: string, body: object) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: envFilename, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
        return data;
    };

    const applyHierarchy = (data: Partial<Hierarchy>) => {
        if (data.folders && data.rootChildren) {
            onHierarchyChange?.({ folders: data.folders, rootChildren: data.rootChildren });
        }
    };

    const handleCreateRoute = async (routeType: string, parentFolderUuid: string | null) => {
        if (!envFilename) return;
        setIsCreating(true);
        setMenu(null);
        try {
            const data = await post('/api/environments/routes', { action: 'create', routeType, parentFolderUuid });
            onRouteCreated?.(
                data.route,
                data.folders && data.rootChildren ? { folders: data.folders, rootChildren: data.rootChildren } : undefined
            );
            if (parentFolderUuid) expand(parentFolderUuid);
            onSelectRoute(data.route.uuid);
            notify?.(`${ROUTE_TYPE_NAMES[routeType] || 'Route'} created`, 'success');
        } catch {
            notify?.('Error creating route', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateFolder = async (parentFolderUuid: string | null) => {
        if (!envFilename) return;
        setIsCreating(true);
        setMenu(null);
        try {
            const data = await post('/api/environments/folders', {
                action: 'create',
                folder: { name: 'New folder' },
                parentFolderUuid,
            });
            applyHierarchy(data);
            if (parentFolderUuid) expand(parentFolderUuid);
            // Name it right away
            startRename(data.folder);
            notify?.('Folder created', 'success');
        } catch {
            notify?.('Error creating folder', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const startRename = (folder: Folder) => {
        renameCancelled.current = false;
        setRenaming({ uuid: folder.uuid, name: folder.name });
    };

    const commitRename = async () => {
        if (!renaming || renameCancelled.current) return;
        const { uuid, name } = renaming;
        setRenaming(null);
        const trimmed = name.trim();
        if (!trimmed || trimmed === foldersById.get(uuid)?.name) return;
        try {
            applyHierarchy(await post('/api/environments/folders', { action: 'update', folderUuid: uuid, folder: { name: trimmed } }));
        } catch (error) {
            notify?.(error instanceof Error ? error.message : 'Error renaming folder', 'error');
        }
    };

    const handleDeleteFolder = async (folderUuid: string) => {
        try {
            applyHierarchy(await post('/api/environments/folders', { action: 'delete', folderUuid }));
            setFolderToDelete(null);
            notify?.('Folder deleted', 'success');
        } catch {
            notify?.('Error deleting folder', 'error');
        }
    };

    const handleMove = async (item: Item, targetFolderUuid: string | null) => {
        setMenu(null);
        if (!envFilename || parentOf(item.uuid) === targetFolderUuid) return;
        try {
            applyHierarchy(await post('/api/environments/folders', {
                action: 'move',
                itemType: item.type,
                itemUuid: item.uuid,
                targetFolderUuid,
            }));
            if (targetFolderUuid) expand(targetFolderUuid);
        } catch (error) {
            notify?.(error instanceof Error ? error.message : 'Error moving item', 'error');
        }
    };

    const handleDeleteRoute = async (routeUuid: string) => {
        if (!envFilename) return;
        try {
            await post('/api/environments/routes', { action: 'delete', routeUuid });
            setRouteToDelete(null);
            onRouteDeleted?.(routeUuid);
            notify?.('Route deleted', 'success');
        } catch {
            notify?.('Error deleting route', 'error');
        }
    };

    const expand = (uuid: string) => setCollapsed(prev => {
        if (!prev.has(uuid)) return prev;
        const next = new Set(prev);
        next.delete(uuid);
        return next;
    });

    const toggle = (uuid: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(uuid)) next.delete(uuid);
        else next.add(uuid);
        return next;
    });

    // Drag and drop: drop on a folder to move into it, on the list background to move to the root
    const dragProps = (item: Item) => ({
        draggable: !renaming,
        onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(DRAG_TYPE, item.uuid);
            // Firefox only starts a drag with some data set
            e.dataTransfer.setData('text/plain', item.uuid);
            setDragItem(item);
        },
        onDragEnd: () => {
            setDragItem(null);
            setDropTarget(null);
        },
    });

    const canDropInto = (folderUuid: string | null) =>
        !!dragItem && !(dragItem.type === 'folder' && folderUuid !== null &&
            moveTargets(dragItem).every(t => t.folder.uuid !== folderUuid));

    const dropProps = (folderUuid: string | null) => ({
        onDragOver: (e: React.DragEvent) => {
            if (!canDropInto(folderUuid)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget(folderUuid ?? 'root');
        },
        onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const item = dragItem;
            setDragItem(null);
            setDropTarget(null);
            if (item && canDropInto(folderUuid)) handleMove(item, folderUuid);
        },
    });

    const indent = (depth: number) => ({ paddingLeft: 12 + depth * 16 });

    const renderRoute = (route: Route, depth: number) => {
        const isActive = activeRouteId === route.uuid;
        return (
            <div
                key={route.uuid}
                {...dragProps({ type: 'route', uuid: route.uuid })}
                onClick={() => onSelectRoute(route.uuid)}
                style={indent(depth)}
                className={`
                    group relative pr-3 py-2 cursor-pointer border-b border-border-muted flex items-center justify-between gap-3
                    ${isActive ? 'bg-accent-subtle' : 'hover:bg-canvas-muted'}
                    ${dragItem?.uuid === route.uuid ? 'opacity-50' : ''}
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
                    {folders.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenu({ kind: 'move', item: { type: 'route', uuid: route.uuid }, ...menuAt(e.currentTarget) });
                            }}
                            className="btn btn-invisible btn-icon btn-sm !w-6 !h-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Move to folder"
                            aria-label="Move to folder"
                            aria-haspopup="menu"
                        >
                            <MoveToEndIcon size={14} />
                        </button>
                    )}
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
    };

    const renderFolder = (folder: Folder, depth: number, seen: Set<string>) => {
        // While filtering, every visible folder is shown open
        const isOpen = !!query || !collapsed.has(folder.uuid);
        const isDropTarget = dropTarget === folder.uuid;
        const isRenaming = renaming?.uuid === folder.uuid;
        return (
            <div key={folder.uuid} {...dropProps(folder.uuid)}>
                <div
                    {...dragProps({ type: 'folder', uuid: folder.uuid })}
                    onClick={() => !isRenaming && toggle(folder.uuid)}
                    style={indent(depth)}
                    className={`
                        group relative pr-3 py-1.5 cursor-pointer border-b border-border-muted flex items-center gap-2
                        ${isDropTarget ? 'bg-accent-subtle outline outline-1 -outline-offset-1 outline-accent' : 'hover:bg-canvas-muted'}
                        ${dragItem?.uuid === folder.uuid ? 'opacity-50' : ''}
                    `}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggle(folder.uuid);
                        }}
                        className="btn btn-invisible btn-icon btn-sm !w-5 !h-5 flex-shrink-0"
                        aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                        aria-expanded={isOpen}
                    >
                        {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                    </button>
                    <span className="text-fg-muted flex-shrink-0">
                        {isOpen ? <FileDirectoryOpenFillIcon size={16} /> : <FileDirectoryIcon size={16} />}
                    </span>

                    {isRenaming ? (
                        <input
                            aria-label="Folder name"
                            autoFocus
                            maxLength={100}
                            value={renaming.name}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setRenaming({ uuid: folder.uuid, name: e.target.value })}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') {
                                    renameCancelled.current = true;
                                    setRenaming(null);
                                }
                            }}
                            className="form-control form-control-sm flex-1 min-w-0 !h-6 text-[13px]"
                        />
                    ) : (
                        <span
                            className="flex-1 min-w-0 truncate text-[13px] font-semibold text-fg-default"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(folder);
                            }}
                        >
                            {folder.name}
                        </span>
                    )}

                    {!isRenaming && (
                        <>
                            <span className="Counter group-hover:hidden group-focus-within:hidden">{countRoutes(folder)}</span>
                            <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenu({ kind: 'add', parentFolderUuid: folder.uuid, ...menuAt(e.currentTarget) });
                                    }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6"
                                    title="Add to folder"
                                    aria-label={`Add to ${folder.name}`}
                                    aria-haspopup="menu"
                                >
                                    <PlusIcon size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        startRename(folder);
                                    }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6"
                                    title="Rename folder"
                                    aria-label={`Rename ${folder.name}`}
                                >
                                    <PencilIcon size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenu({ kind: 'move', item: { type: 'folder', uuid: folder.uuid }, ...menuAt(e.currentTarget) });
                                    }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6"
                                    title="Move folder"
                                    aria-label={`Move ${folder.name}`}
                                    aria-haspopup="menu"
                                >
                                    <MoveToEndIcon size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFolderToDelete(folder);
                                    }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6 hover:!text-danger"
                                    title="Delete folder"
                                    aria-label={`Delete ${folder.name}`}
                                >
                                    <TrashIcon size={14} />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {isOpen && renderChildren(folder.children, depth + 1, seen)}
            </div>
        );
    };

    // `seen` guards against a malformed file where a folder contains itself
    const renderChildren = (children: FolderChild[], depth: number, seen: Set<string>): React.ReactNode[] =>
        children.map(child => {
            if (child.type === 'route') {
                const route = routesById.get(child.uuid);
                return route && routeMatches(route) ? renderRoute(route, depth) : null;
            }
            const folder = foldersById.get(child.uuid);
            if (!folder || seen.has(folder.uuid) || !folderVisible(folder)) return null;
            return renderFolder(folder, depth, new Set(seen).add(folder.uuid));
        });

    const tree = renderChildren(rootChildren, 0, new Set());
    const isEmpty = tree.every(node => node === null);

    return (
        <div className="w-80 flex-shrink-0 bg-canvas border-r border-border-custom flex flex-col overflow-hidden">
            {/* Filter Header */}
            <div className="p-3 border-b border-border-custom bg-canvas-muted space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-fg-default">Routes</h3>
                        <span className="Counter">{routes.length}</span>
                    </div>
                    <button
                        onClick={(e) => {
                            const anchor = menuAt(e.currentTarget);
                            setMenu(menu?.kind === 'add' && menu.parentFolderUuid === null ? null : { kind: 'add', parentFolderUuid: null, ...anchor });
                        }}
                        disabled={isCreating || !activeEnv}
                        className="btn btn-sm"
                        title="Add new"
                        aria-haspopup="menu"
                        aria-expanded={menu?.kind === 'add' && menu.parentFolderUuid === null}
                    >
                        {isCreating ? (
                            <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <PlusIcon />
                        )}
                        <TriangleDownIcon />
                    </button>
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

            {/* Routes and folders; the background is the drop zone for "move to root" */}
            <div
                {...dropProps(null)}
                className={`flex-1 overflow-y-auto ${dropTarget === 'root' ? 'bg-accent-subtle/40' : ''}`}
            >
                {tree}
                {isEmpty && (
                    <div className="p-8 text-center text-sm text-fg-muted">
                        {query ? 'No matching routes' : 'No routes found'}
                    </div>
                )}
                {dragItem && parentOf(dragItem.uuid) !== null && (
                    <div className="m-3 p-3 rounded-md border border-dashed border-border-custom text-center text-xs text-fg-muted">
                        Drop here to move to the top level
                    </div>
                )}
            </div>

            {menu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                    <div
                        role="menu"
                        className="Overlay fixed z-50 p-2 min-w-[200px] max-h-[60vh] overflow-y-auto"
                        style={{ top: menu.top, bottom: menu.bottom, right: menu.right }}
                        onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}
                    >
                        {menu.kind === 'add' ? (
                            <>
                                <button role="menuitem" autoFocus onClick={() => handleCreateRoute('http', menu.parentFolderUuid)} className="ActionList-item">
                                    <span className="Label text-get border-get/40 !h-[18px] !px-1.5 text-[10px]">HTTP</span> HTTP route
                                </button>
                                <button role="menuitem" onClick={() => handleCreateRoute('crud', menu.parentFolderUuid)} className="ActionList-item">
                                    <span className="Label text-post border-post/40 !h-[18px] !px-1.5 text-[10px]">CRUD</span> CRUD route
                                </button>
                                <button role="menuitem" onClick={() => handleCreateRoute('ws', menu.parentFolderUuid)} className="ActionList-item">
                                    <span className="Label text-patch border-patch/40 !h-[18px] !px-1.5 text-[10px]">WS</span> WebSocket
                                </button>
                                <div className="border-t border-border-muted my-2 -mx-2" />
                                <button role="menuitem" onClick={() => handleCreateFolder(menu.parentFolderUuid)} className="ActionList-item">
                                    <FileDirectoryIcon /> Folder
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="px-2 pb-1 text-xs font-semibold text-fg-muted">Move to</div>
                                <button
                                    role="menuitem"
                                    autoFocus
                                    disabled={parentOf(menu.item.uuid) === null}
                                    onClick={() => handleMove(menu.item, null)}
                                    className="ActionList-item disabled:opacity-50"
                                >
                                    Top level
                                </button>
                                {moveTargets(menu.item).map(({ folder, depth }) => (
                                    <button
                                        key={folder.uuid}
                                        role="menuitem"
                                        disabled={parentOf(menu.item.uuid) === folder.uuid}
                                        onClick={() => handleMove(menu.item, folder.uuid)}
                                        className="ActionList-item disabled:opacity-50"
                                        style={{ paddingLeft: 8 + depth * 16 }}
                                    >
                                        <FileDirectoryIcon /> <span className="truncate">{folder.name}</span>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </>
            )}

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

            {folderToDelete && (
                <ConfirmDialog
                    title="Delete folder"
                    confirmLabel="Delete folder"
                    onConfirm={() => handleDeleteFolder(folderToDelete.uuid)}
                    onCancel={() => setFolderToDelete(null)}
                >
                    Delete the folder <strong className="text-fg-default">{folderToDelete.name}</strong>?{' '}
                    {folderToDelete.children.length > 0
                        ? 'Its routes and subfolders are kept and move up one level.'
                        : 'It is empty.'}
                </ConfirmDialog>
            )}
        </div>
    );
}
