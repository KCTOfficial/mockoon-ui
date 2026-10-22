import { useEffect, useRef, useState } from 'react';
import {
    FileCodeIcon,
    PlusIcon,
    SidebarCollapseIcon,
    SidebarExpandIcon,
    TrashIcon,
    UploadIcon,
} from '@primer/octicons-react';
import { Environment } from '@/types/mockoon';

export type MainView = 'routes' | 'databuckets' | 'settings' | 'logs';

interface SidebarProps {
    environments: Environment[];
    activeEnvId: string;
    onSelectEnv: (id: string) => void;
    onAddEnv: () => void;
    onImportEnv: (file: File) => void;
    onImportOpenAPI: (file: File) => void;
    onDeleteEnv?: (id: string) => void;
}

const COLLAPSED_KEY = 'sidebarCollapsed';

// Primer-like avatar tints, picked deterministically from the environment name
const AVATAR_TINTS = [
    'bg-accent-subtle text-accent',
    'bg-success-subtle text-success',
    'bg-attention-subtle text-attention',
    'bg-danger-subtle text-danger',
    'bg-[var(--done-subtle)] text-done',
];

function avatarTint(name: string) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
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

export default function Sidebar({ environments, activeEnvId, onSelectEnv, onAddEnv, onImportEnv, onImportOpenAPI, onDeleteEnv }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const openApiInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        try {
            localStorage.setItem(COLLAPSED_KEY, String(collapsed));
        } catch {
            // Storage unavailable; state just won't persist
        }
    }, [collapsed]);

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

    const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

    return (
        <aside
            className={`${collapsed ? 'w-14' : 'w-64'} flex-shrink-0 bg-canvas border-r border-border-custom flex flex-col transition-[width] duration-150 ease-out`}
            aria-label="Environments"
        >
            {/* Header */}
            <div className={`flex items-center h-12 px-2 border-b border-border-muted ${collapsed ? 'justify-center' : 'justify-between pl-4'}`}>
                {!collapsed && (
                    <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-sm font-semibold text-fg-default truncate">Environments</h2>
                        <span className="Counter">{environments.length}</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="btn btn-invisible btn-icon btn-sm"
                    title={toggleLabel}
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                >
                    {collapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
                </button>
            </div>

            {/* Environment list */}
            <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
                <ul className="space-y-0.5">
                    {environments.map((env) => {
                        const initials = env.name.slice(0, 2).toUpperCase();
                        const isActive = activeEnvId === env.uuid;

                        return (
                            <li key={env.uuid} className="relative group">
                                <WithTooltip label={env.name} enabled={collapsed}>
                                    <button
                                        onClick={() => onSelectEnv(env.uuid)}
                                        className={`NavList-item ${isActive ? 'is-selected' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
                                        aria-current={isActive ? 'page' : undefined}
                                        aria-label={collapsed ? env.name : undefined}
                                    >
                                        <span className={`w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center text-[10px] font-semibold select-none ${avatarTint(env.name)}`}>
                                            {initials}
                                        </span>
                                        {!collapsed && (
                                            <>
                                                <span className="flex-1 min-w-0 truncate">{env.name}</span>
                                                <span className={`text-xs font-mono font-normal text-fg-muted ${onDeleteEnv ? 'group-hover:invisible group-focus-within:invisible' : ''}`}>:{env.port}</span>
                                            </>
                                        )}
                                    </button>
                                </WithTooltip>
                                {!collapsed && onDeleteEnv && (
                                    <button
                                        onClick={() => onDeleteEnv(env.uuid)}
                                        className="btn btn-invisible btn-icon btn-sm !w-6 !h-6 absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:!text-danger"
                                        title={`Delete ${env.name}`}
                                        aria-label={`Delete ${env.name}`}
                                    >
                                        <TrashIcon size={14} />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {environments.length === 0 && !collapsed && (
                    <p className="px-2 py-6 text-center text-xs text-fg-muted">No environments yet</p>
                )}
            </nav>

            {/* Actions */}
            <div className={`border-t border-border-muted p-3 ${collapsed ? 'flex flex-col items-center gap-2 px-2' : 'space-y-2'}`}>
                <WithTooltip label="Create new environment" enabled={collapsed}>
                    <button
                        onClick={onAddEnv}
                        className={`btn btn-sm btn-primary ${collapsed ? 'btn-icon' : 'w-full'}`}
                        title="Create new environment"
                        aria-label="Create new environment"
                    >
                        <PlusIcon />
                        {!collapsed && 'New environment'}
                    </button>
                </WithTooltip>

                <div className={collapsed ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
                    <WithTooltip label="Import Mockoon environment (JSON)" enabled={collapsed}>
                        <button
                            onClick={() => jsonInputRef.current?.click()}
                            className={`btn btn-sm ${collapsed ? 'btn-icon' : 'w-full'}`}
                            title="Import Mockoon environment (JSON)"
                            aria-label="Import Mockoon environment (JSON)"
                        >
                            <UploadIcon />
                            {!collapsed && 'JSON'}
                        </button>
                    </WithTooltip>
                    <WithTooltip label="Import OpenAPI/Swagger (JSON/YAML)" enabled={collapsed}>
                        <button
                            onClick={() => openApiInputRef.current?.click()}
                            className={`btn btn-sm ${collapsed ? 'btn-icon' : 'w-full'}`}
                            title="Import OpenAPI/Swagger (JSON/YAML)"
                            aria-label="Import OpenAPI/Swagger (JSON/YAML)"
                        >
                            <FileCodeIcon />
                            {!collapsed && 'OpenAPI'}
                        </button>
                    </WithTooltip>
                </div>

                <input ref={jsonInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                <input ref={openApiInputRef} type="file" accept=".json,.yaml,.yml" onChange={handleOpenApiChange} className="hidden" />
            </div>
        </aside>
    );
}
