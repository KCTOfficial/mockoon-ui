import { useState, useEffect, useRef } from 'react';
import { Route, Response, Header, ResponseRule, LogicalOperators, ResponseMode } from '@/types/mockoon';
import HeadersList from './shared/HeadersList';
import RulesList from './shared/RulesList';
import MonacoEditorWrapper from './shared/MonacoEditorWrapper';
import ConfirmDialog from './shared/ConfirmDialog';
import { AlertIcon, CheckIcon, ClockIcon, PlusIcon, RowsIcon, TrashIcon } from '@primer/octicons-react';

// Response Tab Component with inline editing
interface ResponseTabProps {
    response: Response;
    idx: number;
    isActive: boolean;
    onSelect: () => void;
    onRename: (label: string) => void;
}

function ResponseTab({ response, idx, isActive, onSelect, onRename }: ResponseTabProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(response.label || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(response.label || '');
        setIsEditing(true);
    };

    const handleBlur = () => {
        onRename(editValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onRename(editValue);
            setIsEditing(false);
        } else if (e.key === 'Escape') {
            setEditValue(response.label || '');
            setIsEditing(false);
        }
    };

    return (
        <button
            onClick={onSelect}
            onDoubleClick={handleDoubleClick}
            className={`btn btn-sm whitespace-nowrap ${isActive ? '!bg-accent-subtle !border-accent-muted text-accent' : 'btn-invisible'}`}
        >
            <span className={`w-2 h-2 rounded-full ${response.default ? 'bg-accent' : 'bg-fg-subtle'}`} title={response.default ? 'Default Response' : 'Response'} />
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="form-control form-control-sm !h-5 !px-1 w-24"
                />
            ) : (
                <>{response.label || `Response ${idx + 1}`} ({Number(response.statusCode) || 0})</>
            )}
        </button>
    );
}

// Response mode configurations
const RESPONSE_MODES = [
    {
        value: null as ResponseMode,
        icon: 'rule',
        label: 'Rules',
        tooltip: 'Default behavior: rules determine which response to serve'
    },
    {
        value: 'RANDOM' as ResponseMode,
        icon: 'shuffle',
        label: 'Random',
        tooltip: 'Random response mode (will disable the rules)'
    },
    {
        value: 'SEQUENTIAL' as ResponseMode,
        icon: 'repeat',
        label: 'Sequential',
        tooltip: 'Sequential response mode (will disable the rules)'
    },
    {
        value: 'DISABLE_RULES' as ResponseMode,
        icon: 'rule_disabled',
        label: 'No Rules',
        tooltip: 'Disabled rules mode (default response only)'
    },
    {
        value: 'FALLBACK' as ResponseMode,
        icon: 'low_priority',
        label: 'Fallback',
        tooltip: 'Fallback response mode (does not return the default response if none of the rules match, will jump to the next route or use the proxy if configured)'
    }
];

interface RouteEditorProps {
    route?: Route;
    envFilename?: string;
    onSave?: (updatedRoute: Partial<Route>) => void;
    notify?: (message: string, type: 'success' | 'error') => void;
}

export default function RouteEditor({ route, envFilename, onSave, notify }: RouteEditorProps) {
    const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'rules' | 'settings'>('body');
    const [isSaving, setIsSaving] = useState(false);
    const [activeResponseUuid, setActiveResponseUuid] = useState<string | null>(null);
    const [confirmDeleteResponse, setConfirmDeleteResponse] = useState(false);

    // Draft state for uncommitted edits
    const [draftRoute, setDraftRoute] = useState<Route | null>(null);
    const [originalRoute, setOriginalRoute] = useState<Route | null>(null);

    // Initialize/sync draft when route prop changes
    useEffect(() => {
        if (route) {
            // Only reset draft if we're switching routes or don't have one yet
            if (!draftRoute || draftRoute.uuid !== route.uuid) {
                setOriginalRoute(route);
                setDraftRoute(JSON.parse(JSON.stringify(route)));

                const defaultResponse = route.responses.find(r => r.default) || route.responses[0];
                setActiveResponseUuid(defaultResponse?.uuid || null);
            } else {
                // If same route, update original for comparison but keep draft
                setOriginalRoute(route);
            }
        } else {
            setDraftRoute(null);
            setOriginalRoute(null);
            setActiveResponseUuid(null);
        }
    }, [route]);

    // Language state for Monaco Editor
    const [editorLanguage, setEditorLanguage] = useState('json');

    // Helper to detect language from headers
    const detectLanguageFromHeaders = (headers: Header[] = []): string => {
        const contentType = headers.find(h => h.key.toLowerCase() === 'content-type')?.value.toLowerCase();
        if (!contentType) return 'json';
        if (contentType.includes('html')) return 'html';
        if (contentType.includes('xml')) return 'xml';
        if (contentType.includes('javascript')) return 'javascript';
        if (contentType.includes('css')) return 'css';
        if (contentType.includes('text/plain')) return 'plaintext';
        return 'json';
    };

    // Update language when active response changes
    useEffect(() => {
        if (activeResponse) {
            setEditorLanguage(detectLanguageFromHeaders(activeResponse.headers));
        }
    }, [activeResponseUuid]); // Only reset when switching responses, not on every edit

    const activeResponse = draftRoute?.responses.find(r => r.uuid === activeResponseUuid) || null;
    const hasChanges = draftRoute && originalRoute && JSON.stringify(draftRoute) !== JSON.stringify(originalRoute);

    // Keyboard shortcut for saving (Ctrl+S / Cmd+S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (hasChanges && !isSaving) {
                    persistSave();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasChanges, isSaving, draftRoute]);

    if (!draftRoute || !activeResponse) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-canvas p-8">
                <div className="flex flex-col items-center text-center max-w-sm">
                    <span className="text-fg-muted mb-4"><RowsIcon size={24} /></span>
                    <h3 className="text-xl font-semibold text-fg-default mb-1">No route selected</h3>
                    <p className="text-sm text-fg-muted">Select a route from the list to view and edit its responses.</p>
                </div>
            </div>
        );
    }

    const handleUpdateRoute = (updates: Partial<Route>) => {
        if (!draftRoute) return;
        setDraftRoute({ ...draftRoute, ...updates });
    };

    const handleUpdateResponse = (updates: Partial<Response>, responseUuid?: string) => {
        if (!draftRoute) return;
        const targetUuid = responseUuid || activeResponseUuid;
        if (!targetUuid) return;

        const updatedResponses = draftRoute.responses.map(r =>
            r.uuid === targetUuid ? { ...r, ...updates } : r
        );
        setDraftRoute({ ...draftRoute, responses: updatedResponses });
    };

    const persistSave = async () => {
        if (!envFilename || !draftRoute) return;
        setIsSaving(true);
        try {
            // 1. Save top level metadata
            const routeRes = await fetch('/api/environments/update-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    routeUuid: draftRoute.uuid,
                    updatedRoute: {
                        endpoint: draftRoute.endpoint,
                        method: draftRoute.method,
                        responseMode: draftRoute.responseMode
                    }
                })
            });

            if (!routeRes.ok) throw new Error('Failed to save route metadata');

            // 2. Save all responses (simplified: we send them one by one or we could have a bulk endpoint)
            // For now, our existing API is per-response. We'll iterate the changed ones or all.
            // Let's use the local responses update API for the active one at least, 
            // but the ideal is a bulk route update. 
            // Given the current backend structure, let's update all responses.
            for (const res of draftRoute.responses) {
                await fetch('/api/environments/responses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: envFilename,
                        action: 'update',
                        routeUuid: draftRoute.uuid,
                        responseUuid: res.uuid,
                        updatedResponse: res
                    })
                });
            }

            if (onSave) onSave(draftRoute);
            setOriginalRoute(draftRoute); // Mark as synced
            if (notify) notify('Route saved successfully', 'success');
        } catch (error: any) {
            if (notify) notify(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        if (originalRoute) {
            setDraftRoute(JSON.parse(JSON.stringify(originalRoute)));
            if (notify) notify('Changes discarded', 'success');
        }
    };

    const handleAddResponse = async () => {
        if (!envFilename || !draftRoute) return;
        try {
            const res = await fetch('/api/environments/responses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    action: 'create',
                    routeUuid: draftRoute.uuid
                })
            });
            const data = await res.json();
            if (data.success) {
                setActiveResponseUuid(data.response.uuid);
                const updatedResponses = [...draftRoute.responses, data.response];
                const updatedRoute = { ...draftRoute, responses: updatedResponses };
                setDraftRoute(updatedRoute);
                setOriginalRoute(updatedRoute); // Adding a response is a hard action on disk already
                if (onSave) onSave(updatedRoute);
            }
        } catch (error: any) {
            if (notify) notify('Error adding response', 'error');
        }
    };

    const handleDeleteResponse = async () => {
        if (!envFilename || !activeResponseUuid || !draftRoute) return;
        if (draftRoute.responses.length <= 1) return;

        try {
            const res = await fetch('/api/environments/responses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: envFilename,
                    action: 'delete',
                    routeUuid: draftRoute.uuid,
                    responseUuid: activeResponseUuid
                })
            });
            if (res.ok) {
                const remaining = draftRoute.responses.filter(r => r.uuid !== activeResponseUuid);
                setActiveResponseUuid(remaining[0].uuid);
                const updatedRoute = { ...draftRoute, responses: remaining };
                setDraftRoute(updatedRoute);
                setOriginalRoute(updatedRoute); // Deleting is a hard action
                if (onSave) onSave(updatedRoute);
                setConfirmDeleteResponse(false);
            } else if (notify) {
                notify('Error deleting response', 'error');
            }
        } catch (error: any) {
            if (notify) notify('Error deleting response', 'error');
        }
    };

    const methodValue = draftRoute.method.toLowerCase();
    const methodColor: Record<string, string> = {
        get: 'text-get', post: 'text-post', put: 'text-put', patch: 'text-patch', delete: 'text-delete',
    };

    return (
        <div className="flex-1 flex flex-col bg-canvas overflow-hidden">
            {/* 1. Top Header (Endpoint Config) */}
            <div className="px-4 py-3 border-b border-border-custom flex items-center gap-2">
                <div className="flex flex-1 min-w-0">
                    <select
                        value={methodValue}
                        onChange={(e) => handleUpdateRoute({ method: e.target.value as any })}
                        className={`form-control !rounded-r-none font-mono font-semibold text-xs uppercase w-[104px] flex-shrink-0 ${methodColor[methodValue] || 'text-fg-default'}`}
                        aria-label="HTTP method"
                    >
                        {['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].map(m => (
                            <option key={m} value={m}>{m.toUpperCase()}</option>
                        ))}
                    </select>
                    <label className="form-control !rounded-l-none -ml-px flex-1 min-w-0 flex items-center !py-0 cursor-text">
                        <span className="text-fg-muted mr-1 font-mono">/</span>
                        <input
                            type="text"
                            value={draftRoute.endpoint}
                            onChange={(e) => handleUpdateRoute({ endpoint: e.target.value })}
                            className="bg-transparent text-fg-default font-mono outline-none w-full text-sm"
                            aria-label="Endpoint path"
                        />
                    </label>
                </div>

                {/* Response Mode Selector */}
                <div className="SegmentedControl flex-shrink-0" role="radiogroup" aria-label="Response mode">
                    {RESPONSE_MODES.map((mode) => {
                        const isActive = draftRoute.responseMode === mode.value;
                        const isDisabled = mode.value === 'FALLBACK' && draftRoute.type === 'ws';

                        return (
                            <button
                                key={mode.label}
                                onClick={() => !isDisabled && handleUpdateRoute({ responseMode: mode.value })}
                                disabled={isDisabled}
                                role="radio"
                                aria-checked={isActive}
                                aria-label={mode.label}
                                className={`SegmentedControl-item !px-2 ${isActive ? 'is-selected text-accent' : isDisabled ? 'text-fg-disabled !cursor-not-allowed' : 'text-fg-muted'}`}
                            >
                                <div className="relative group">
                                    {mode.icon === 'shuffle' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <polyline points="16 3 21 3 21 8" />
                                            <line x1="4" y1="20" x2="21" y2="3" />
                                            <polyline points="21 16 21 21 16 21" />
                                            <line x1="15" y1="15" x2="21" y2="21" />
                                            <line x1="4" y1="4" x2="9" y2="9" />
                                        </svg>
                                    )}
                                    {mode.icon === 'repeat' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <polyline points="17 1 21 5 17 9" />
                                            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                            <polyline points="7 23 3 19 7 15" />
                                            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                        </svg>
                                    )}
                                    {mode.icon === 'rule' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <path d="M4 6h16M4 12h16M4 18h7" />
                                            <circle cx="17" cy="18" r="3" />
                                        </svg>
                                    )}
                                    {mode.icon === 'rule_disabled' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <path d="M4 6h16M4 12h16M4 18h7" />
                                            <line x1="14" y1="15" x2="20" y2="21" />
                                            <line x1="20" y1="15" x2="14" y2="21" />
                                        </svg>
                                    )}
                                    {mode.icon === 'low_priority' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <path d="M7 4v16M7 4L3 8M7 4l4 4" />
                                            <path d="M11 12h4a4 4 0 1 1 0 8h-1" />
                                            <path d="M14 16l-3 4 3 4" />
                                        </svg>
                                    )}
                                    {/* Tooltip - only shows when hovering the icon */}
                                    <div className="Tooltip absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-56 text-left font-normal">
                                        <div className="font-semibold mb-0.5">{mode.label}</div>
                                        <div className="leading-relaxed">{mode.tooltip}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {hasChanges ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={handleDiscard} disabled={isSaving} className="btn btn-sm">
                            Discard
                        </button>
                        <button onClick={persistSave} disabled={isSaving} className="btn btn-sm btn-primary">
                            {isSaving ? 'Saving…' : (
                                <>
                                    Save changes
                                    <kbd className="text-[10px] font-mono opacity-80 border border-white/30 rounded px-1 leading-4">⌘S</kbd>
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <span className="Label text-success border-success-muted flex-shrink-0">
                        <CheckIcon size={12} className="mr-1" />
                        Synced
                    </span>
                )}
            </div>

            {/* 2. Response Selector & Actions */}
            <div className="px-4 py-2 bg-canvas-muted border-b border-border-custom flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
                    {draftRoute.responses.map((res, idx) => (
                        <ResponseTab
                            key={res.uuid}
                            response={res}
                            idx={idx}
                            isActive={activeResponseUuid === res.uuid}
                            onSelect={() => setActiveResponseUuid(res.uuid)}
                            onRename={(label) => handleUpdateResponse({ label }, res.uuid)}
                        />
                    ))}
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={handleAddResponse} className="btn btn-invisible btn-icon btn-sm" title="Add response" aria-label="Add response">
                        <PlusIcon />
                    </button>
                    <button
                        onClick={() => setConfirmDeleteResponse(true)}
                        disabled={route && route.responses.length <= 1}
                        className="btn btn-invisible btn-icon btn-sm hover:!text-danger"
                        title="Delete current response"
                        aria-label="Delete current response"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </div>

            {/* 3. Tabs & Response Settings */}
            <div className="px-4 border-b border-border-custom flex items-center justify-between gap-4">
                <nav className="UnderlineNav min-h-0 h-12 -ml-2" aria-label="Response">
                    {(['body', 'headers', 'rules', 'settings'] as const).map((tab) => {
                        // Check if rules tab should be disabled
                        const rulesDisablingModes = ['RANDOM', 'SEQUENTIAL', 'DISABLE_RULES'];
                        const isRulesDisabled = tab === 'rules' && rulesDisablingModes.includes(draftRoute.responseMode || '');
                        const count = tab === 'headers' ? activeResponse.headers.length : tab === 'rules' ? activeResponse.rules.length : undefined;

                        return (
                            <button
                                key={tab}
                                onClick={() => !isRulesDisabled && setActiveTab(tab)}
                                disabled={isRulesDisabled}
                                className={`UnderlineNav-item ${activeTab === tab && !isRulesDisabled ? 'is-selected' : ''}`}
                                title={isRulesDisabled ? 'Rules are disabled by current response mode' : undefined}
                            >
                                <span className="UnderlineNav-inner capitalize">
                                    {tab === 'body' ? 'Status & Body' : tab}
                                    {count !== undefined && count > 0 && <span className="Counter">{count}</span>}
                                    {isRulesDisabled && <AlertIcon size={12} className="!text-attention" />}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-2">
                        <span className="text-fg-muted font-semibold">Status</span>
                        <select
                            value={activeResponse.statusCode}
                            onChange={(e) => handleUpdateResponse({ statusCode: parseInt(e.target.value) })}
                            className="form-control form-control-sm w-52"
                        >
                            <optgroup label="2xx Success">
                                <option value="200">200 - OK</option>
                                <option value="201">201 - Created</option>
                                <option value="202">202 - Accepted</option>
                                <option value="204">204 - No Content</option>
                            </optgroup>
                            <optgroup label="3xx Redirection">
                                <option value="301">301 - Moved Permanently</option>
                                <option value="302">302 - Found</option>
                                <option value="304">304 - Not Modified</option>
                            </optgroup>
                            <optgroup label="4xx Client Error">
                                <option value="400">400 - Bad Request</option>
                                <option value="401">401 - Unauthorized</option>
                                <option value="403">403 - Forbidden</option>
                                <option value="404">404 - Not Found</option>
                                <option value="405">405 - Method Not Allowed</option>
                                <option value="409">409 - Conflict</option>
                                <option value="418">418 - I'm a teapot</option>
                            </optgroup>
                            <optgroup label="5xx Server Error">
                                <option value="500">500 - Internal Server Error</option>
                                <option value="501">501 - Not Implemented</option>
                                <option value="502">502 - Bad Gateway</option>
                                <option value="503">503 - Service Unavailable</option>
                                <option value="504">504 - Gateway Timeout</option>
                            </optgroup>
                        </select>
                    </label>
                    <div className="flex items-center gap-2">
                        <div className="relative group text-fg-muted">
                            <ClockIcon size={14} />
                            {/* Latency Tooltip - only shows when hovering the icon */}
                            <div className="Tooltip absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-56">
                                <div className="font-semibold mb-0.5">Response Latency</div>
                                <div className="leading-relaxed">Add artificial delay before the response is sent. Useful for testing loading states and slow network conditions.</div>
                            </div>
                        </div>
                        <input
                            type="number"
                            value={activeResponse.latency}
                            onChange={(e) => handleUpdateResponse({ latency: parseInt(e.target.value) || 0 })}
                            className="form-control form-control-sm font-mono w-20"
                            min="0"
                            aria-label="Latency in milliseconds"
                        />
                        <span className="text-fg-muted font-mono">ms</span>
                    </div>
                </div>
            </div>

            {/* 4. Tab Content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'body' && (
                    <div className="h-full flex flex-col p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-fg-default">Response body</span>
                            <div className="SegmentedControl" role="radiogroup" aria-label="Body type">
                                <button
                                    onClick={() => handleUpdateResponse({ bodyType: 'INLINE' })}
                                    role="radio"
                                    aria-checked={activeResponse.bodyType === 'INLINE'}
                                    className={`SegmentedControl-item ${activeResponse.bodyType === 'INLINE' ? 'is-selected' : ''}`}
                                >
                                    Inline
                                </button>
                                <button
                                    onClick={() => handleUpdateResponse({ bodyType: 'FILE' })}
                                    role="radio"
                                    aria-checked={activeResponse.bodyType === 'FILE'}
                                    className={`SegmentedControl-item ${activeResponse.bodyType === 'FILE' ? 'is-selected' : ''}`}
                                >
                                    File
                                </button>
                            </div>
                        </div>

                        {activeResponse.bodyType === 'INLINE' ? (
                            <div className="flex-1 min-h-[400px]">
                                <MonacoEditorWrapper
                                    height="100%"
                                    value={activeResponse.body}
                                    language={editorLanguage}
                                    onLanguageChange={setEditorLanguage}
                                    onChange={(val) => handleUpdateResponse({ body: val || '' })}
                                />
                            </div>
                        ) : (
                            <div className="Box p-8 border-dashed text-center">
                                <p className="text-fg-muted text-sm mb-4">File serving is available. Select a file from your disk.</p>
                                <input
                                    type="text"
                                    placeholder="File path..."
                                    value={activeResponse.filePath}
                                    onChange={(e) => handleUpdateResponse({ filePath: e.target.value })}
                                    className="form-control w-full max-w-md font-mono"
                                />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'headers' && (
                    <HeadersList
                        headers={activeResponse.headers}
                        onChange={(headers) => handleUpdateResponse({ headers })}
                    />
                )}

                {activeTab === 'rules' && (
                    <RulesList
                        rules={activeResponse.rules}
                        operator={activeResponse.rulesOperator}
                        onChange={(rules) => handleUpdateResponse({ rules })}
                        onOperatorChange={(rulesOperator) => handleUpdateResponse({ rulesOperator })}
                    />
                )}

                {activeTab === 'settings' && (
                    <div className="p-4 max-w-3xl space-y-6">
                        <div className="Box">
                            <div className="Box-row flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-fg-default">Default response</p>
                                    <p className="text-xs text-fg-muted">Serve this response if no other rules match.</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={!!activeResponse.default}
                                    aria-label="Default response"
                                    onClick={() => handleUpdateResponse({ default: !activeResponse.default })}
                                    className="ToggleSwitch"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="response-label" className="form-label">Response label</label>
                            <input
                                id="response-label"
                                type="text"
                                placeholder="Label for this response..."
                                value={activeResponse.label}
                                onChange={(e) => handleUpdateResponse({ label: e.target.value })}
                                className="form-control w-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {confirmDeleteResponse && (
                <ConfirmDialog
                    title="Delete response"
                    confirmLabel="Delete response"
                    onConfirm={handleDeleteResponse}
                    onCancel={() => setConfirmDeleteResponse(false)}
                >
                    Delete the response{' '}
                    <strong className="text-fg-default">&ldquo;{activeResponse.label || 'Untitled'}&rdquo;</strong>{' '}
                    from this route? This cannot be undone.
                </ConfirmDialog>
            )}
        </div>
    );
}
