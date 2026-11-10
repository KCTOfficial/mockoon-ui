import { useEffect, useRef, useState } from 'react';
import {
    DownloadIcon,
    DuplicateIcon,
    FileCodeIcon,
    PlusIcon,
    SidebarCollapseIcon,
    SidebarExpandIcon,
    TrashIcon,
    UploadIcon,
} from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';
import ActionMenu, { ActionMenuItem } from './shared/ActionMenu';
import { avatarTint } from './shared/EnvAvatar';
import { NARROW_QUERY, useMediaQuery } from './shared/useMediaQuery';

export type MainView = 'routes' | 'databuckets' | 'settings' | 'logs';

interface SidebarProps {
    environments: Environment[];
    activeEnvId: string;
    onSelectEnv: (id: string) => void;
    onAddEnv: () => void;
    onImportEnv: (file: File) => void;
    onImportOpenAPI: (file: File) => void;
    /** PM2 status per environment uuid ('online', 'stopped', 'errored', ...) */
    envStatuses?: Record<string, string>;
    onExportEnv?: (id: string) => void;
    onDeleteEnv?: (id: string) => void;
    onDuplicateEnv?: (id: string) => void;
    /** Opens the recycle bin; the button is shown only when this is set */
    onOpenTrash?: () => void;
    /** Deleted environments waiting in the recycle bin */
    trashCount?: number;
}

const COLLAPSED_KEY = 'sidebarCollapsed';
const WIDTH_KEY = 'sidebarWidth';
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const COLLAPSED_WIDTH = 56;

const clampWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

// Dot on the avatar: running, starting/restarting, crashed, or stopped (also when never started)
function statusDot(status: string | undefined) {
    if (status === 'online') return { label: 'Running', className: 'bg-success' };
    if (status === 'launching' || status === 'waiting restart') return { label: 'Starting', className: 'bg-attention' };
    if (status === 'errored') return { label: 'Error', className: 'bg-danger' };
    return { label: 'Stopped', className: 'bg-fg-subtle' };
}

function readWidth() {
    try {
        const saved = Number(localStorage.getItem(WIDTH_KEY));
        return saved ? clampWidth(saved) : DEFAULT_WIDTH;
    } catch {
        return DEFAULT_WIDTH;
    }
}

function readCollapsed() {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Shows a label next to the element while hovered; used for icon-only items in collapsed mode.
 * Fixed positioning keeps it from being clipped by the scrollable list.
 */
function WithTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: React.ReactNode }) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    return (
        <div
            onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setAnchor(null)}
        >
            {children}
            {enabled && anchor && (
                <div
                    role="tooltip"
                    className="Tooltip fixed -translate-y-1/2 whitespace-nowrap z-50"
                    style={{ left: anchor.right + 8, top: anchor.top + anchor.height / 2 }}
                >
                    {label}
                </div>
            )}
        </div>
    );
}

export default function Sidebar({ environments, activeEnvId, onSelectEnv, onAddEnv, onImportEnv, onImportOpenAPI, envStatuses, onExportEnv, onDeleteEnv, onDuplicateEnv, onOpenTrash, trashCount = 0 }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    // Narrow screens: always the icon rail; the toggle opens the full list over the page instead of pushing it
    const narrow = useMediaQuery(NARROW_QUERY);
    const [overlayOpen, setOverlayOpen] = useState(false);
    const isCollapsed = narrow ? !overlayOpen : collapsed;
    const [width, setWidth] = useState(readWidth);
    const [isResizing, setIsResizing] = useState(false);
    const dragStart = useRef<{ x: number; width: number } | null>(null);
    const hasActions = !!(onExportEnv || onDeleteEnv || onDuplicateEnv);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const openApiInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try {
            localStorage.setItem(COLLAPSED_KEY, String(collapsed));
        } catch {
            // Storage unavailable; state just won't persist
        }
    }, [collapsed]);

    // The overlay closes with Escape, and when the window gets wide again
    useEffect(() => {
        if (!narrow) setOverlayOpen(false);
    }, [narrow]);
    useEffect(() => {
        if (!overlayOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOverlayOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [overlayOpen]);

    useEffect(() => {
        try {
            localStorage.setItem(WIDTH_KEY, String(width));
        } catch {
            // Storage unavailable; width just won't persist
        }
    }, [width]);

    // Drag the right edge; pointer capture keeps the drag going outside the handle
    const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStart.current = { x: e.clientX, width };
        setIsResizing(true);
    };
    const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStart.current) return;
        setWidth(clampWidth(dragStart.current.width + e.clientX - dragStart.current.x));
    };
    const handleResizeEnd = () => {
        dragStart.current = null;
        setIsResizing(false);
    };
    const handleResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') setWidth(w => clampWidth(w - step));
        else if (e.key === 'ArrowRight') setWidth(w => clampWidth(w + step));
        else if (e.key === 'Home') setWidth(MIN_WIDTH);
        else if (e.key === 'End') setWidth(MAX_WIDTH);
        else return;
        e.preventDefault();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportEnv(file);
            // Reset the input so the same file can be selected again
            e.target.value = '';
        }
    };

    const handleOpenApiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportOpenAPI(file);
            // Reset the input so the same file can be selected again
            e.target.value = '';
        }
    };

    const toggleLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

    const aside = (
        <aside
            className={`bg-canvas border-r border-border-custom flex flex-col ${isResizing ? '' : 'transition-[width] duration-150 ease-out'} ${narrow
                ? `absolute inset-y-0 left-0 z-30 ${overlayOpen ? 'shadow-[var(--shadow-overlay)]' : ''}`
                : 'relative flex-shrink-0'}`}
            style={{ width: isCollapsed ? COLLAPSED_WIDTH : narrow ? Math.min(DEFAULT_WIDTH, window.innerWidth - 32) : width }}
            aria-label="Environments"
        >
            {!isCollapsed && !narrow && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    aria-valuenow={width}
                    aria-valuemin={MIN_WIDTH}
                    aria-valuemax={MAX_WIDTH}
                    tabIndex={0}
                    title="Drag to resize, double-click to reset"
                    onPointerDown={handleResizeStart}
                    onPointerMove={handleResizeMove}
                    onPointerUp={handleResizeEnd}
                    onPointerCancel={handleResizeEnd}
                    onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
                    onKeyDown={handleResizeKey}
                    className={`absolute top-0 -right-[3px] z-20 h-full w-1.5 cursor-col-resize select-none touch-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none ${isResizing ? 'bg-accent/50' : ''}`}
                />
            )}
            {/* Header */}
            <div className={`flex items-center h-12 px-2 border-b border-border-muted ${isCollapsed ? 'justify-center' : 'justify-between pl-4'}`}>
                {!isCollapsed && (
                    <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-sm font-semibold text-fg-default truncate">Environments</h2>
                        <span className="Counter">{environments.length}</span>
                    </div>
                )}
                <button
                    onClick={() => (narrow ? setOverlayOpen(open => !open) : setCollapsed(c => !c))}
                    className="btn btn-invisible btn-icon btn-sm"
                    title={toggleLabel}
                    aria-label={toggleLabel}
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
                </button>
            </div>

            {/* Environment list */}
            <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-2 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                <ul className="space-y-0.5">
                    {environments.map((env) => {
                        const initials = env.name.slice(0, 2).toUpperCase();
                        const isActive = activeEnvId === env.uuid;
                        const status = envStatuses ? statusDot(envStatuses[env.uuid]) : null;

                        return (
                            <li key={env.uuid} className="relative group">
                                <WithTooltip label={status ? `${env.name} (${status.label})` : env.name} enabled={isCollapsed}>
                                    <button
                                        onClick={() => {
                                            onSelectEnv(env.uuid);
                                            setOverlayOpen(false);
                                        }}
                                        className={`NavList-item ${isActive ? 'is-selected' : ''} ${isCollapsed ? 'justify-center px-0' : ''}`}
                                        aria-current={isActive ? 'page' : undefined}
                                        aria-label={isCollapsed ? (status ? `${env.name}, ${status.label}` : env.name) : undefined}
                                    >
                                        <span className={`relative w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center text-[10px] font-semibold select-none ${avatarTint(env.name)}`}>
                                            {initials}
                                            {status && (
                                                <span
                                                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--bg-default)] ${status.className}`}
                                                    title={status.label}
                                                >
                                                    <span className="sr-only">{status.label}</span>
                                                </span>
                                            )}
                                        </span>
                                        {!isCollapsed && (
                                            <>
                                                <span className="flex-1 min-w-0 truncate">{env.name}</span>
                                                {/* The "..." button takes the port's place on hover, while its menu is open, and on touch screens */}
                                                <span className={`text-xs font-mono font-normal text-fg-muted ${hasActions ? 'group-hover:invisible group-focus-within:invisible group-has-[[aria-expanded=true]]:invisible [@media(hover:none)]:invisible' : ''}`}>:{env.port}</span>
                                            </>
                                        )}
                                    </button>
                                </WithTooltip>
                                {!isCollapsed && hasActions && (
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                                        <ActionMenu
                                            label={`Actions for ${env.name}`}
                                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                                            items={[
                                                ...(onDuplicateEnv
                                                    ? [{ key: 'duplicate', label: 'Duplicate environment', icon: <DuplicateIcon />, onSelect: () => onDuplicateEnv(env.uuid) }]
                                                    : []),
                                                ...(onExportEnv
                                                    ? [{ key: 'export', label: 'Export environment', icon: <DownloadIcon />, onSelect: () => onExportEnv(env.uuid) }]
                                                    : []),
                                                ...(onDeleteEnv
                                                    ? [{
                                                        key: 'delete',
                                                        label: 'Delete environment…',
                                                        icon: <TrashIcon />,
                                                        variant: 'danger' as const,
                                                        dividerBefore: !!onExportEnv,
                                                        onSelect: () => onDeleteEnv(env.uuid),
                                                    }]
                                                    : []),
                                            ] satisfies ActionMenuItem[]}
                                        />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {environments.length === 0 && !isCollapsed && (
                    <p className="px-2 py-6 text-center text-xs text-fg-muted">No environments yet</p>
                )}
            </nav>

            {/* Actions */}
            <div className={`border-t border-border-muted p-3 ${isCollapsed ? 'flex flex-col items-center gap-2 px-2' : 'space-y-2'}`}>
                <WithTooltip label="Create new environment" enabled={isCollapsed}>
                    <button
                        onClick={onAddEnv}
                        className={`btn btn-sm btn-primary ${isCollapsed ? 'btn-icon' : 'w-full'}`}
                        title="Create new environment"
                        aria-label="Create new environment"
                    >
                        <PlusIcon />
                        {!isCollapsed && 'New environment'}
                    </button>
                </WithTooltip>

                <div className={isCollapsed ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
                    <WithTooltip label="Import Mockoon environment (JSON)" enabled={isCollapsed}>
                        <button
                            onClick={() => jsonInputRef.current?.click()}
                            className={`btn btn-sm ${isCollapsed ? 'btn-icon' : 'w-full'}`}
                            title="Import Mockoon environment (JSON)"
                            aria-label="Import Mockoon environment (JSON)"
                        >
                            <UploadIcon />
                            {!isCollapsed && 'JSON'}
                        </button>
                    </WithTooltip>
                    <WithTooltip label="Import OpenAPI/Swagger (JSON/YAML)" enabled={isCollapsed}>
                        <button
                            onClick={() => openApiInputRef.current?.click()}
                            className={`btn btn-sm ${isCollapsed ? 'btn-icon' : 'w-full'}`}
                            title="Import OpenAPI/Swagger (JSON/YAML)"
                            aria-label="Import OpenAPI/Swagger (JSON/YAML)"
                        >
                            <FileCodeIcon />
                            {!isCollapsed && 'OpenAPI'}
                        </button>
                    </WithTooltip>
                </div>

                {onOpenTrash && (
                    <WithTooltip label={`Recycle bin (${trashCount})`} enabled={isCollapsed}>
                        <button
                            onClick={onOpenTrash}
                            className={`btn btn-sm !border-danger-muted hover:!bg-danger-subtle [&>svg]:text-danger ${isCollapsed ? 'btn-icon relative' : 'w-full justify-center'}`}
                            title="Recycle bin"
                            aria-label={`Recycle bin, ${trashCount} item${trashCount === 1 ? '' : 's'}`}
                        >
                            <TrashIcon />
                            {!isCollapsed && 'Recycle bin'}
                            {!isCollapsed && trashCount > 0 && <span className="Counter">{trashCount}</span>}
                            {isCollapsed && trashCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                            )}
                        </button>
                    </WithTooltip>
                )}

                <input ref={jsonInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                <input ref={openApiInputRef} type="file" accept=".json,.yaml,.yml" onChange={handleOpenApiChange} className="hidden" />
            </div>
        </aside>
    );

    if (!narrow) return aside;
    // Keeps the rail's width in the layout while the full list floats above the page
    return (
        <div className="relative flex-shrink-0" style={{ width: COLLAPSED_WIDTH }}>
            {overlayOpen && (
                <div className="fixed inset-0 z-20 bg-[var(--backdrop)]" onClick={() => setOverlayOpen(false)} aria-hidden="true" />
            )}
            {aside}
        </div>
    );
}
