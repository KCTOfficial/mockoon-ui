'use client';

import { useState, useEffect, useRef } from 'react';
import { Route, Response, Header, ResponseRule, LogicalOperators, ResponseMode } from '@/types/mockoon';
import HeadersList from './shared/HeadersList';
import RulesList from './shared/RulesList';
import MonacoEditorWrapper from './shared/MonacoEditorWrapper';

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
            className={`
                flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all whitespace-nowrap
                ${isActive
                    ? 'bg-active text-accent border border-accent/30 shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-hover'}
            `}
        >
            <span className={`w-2 h-2 rounded-full ${response.default ? 'bg-accent' : 'bg-text-disabled'}`} title={response.default ? 'Default Response' : 'Response'} />
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-input border border-accent rounded px-1 py-0.5 w-20 text-text-primary outline-none"
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
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted bg-editor">
                <svg className="w-16 h-16 mb-4 opacity-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z" />
                </svg>
                <p className="font-light">Select a route to view its details</p>
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
            }
        } catch (error: any) {
            if (notify) notify('Error deleting response', 'error');
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-editor overflow-hidden">
            {/* 1. Top Header (Endpoint Config) */}
            <div className="px-4 py-3 border-b border-border-custom bg-sidebar/50 flex items-center gap-2">
                <select
                    value={draftRoute.method.toLowerCase()}
                    onChange={(e) => handleUpdateRoute({ method: e.target.value as any })}
                    className="px-2 py-1 rounded bg-surface text-xs font-bold uppercase text-accent border border-border-custom min-w-[80px] text-center outline-none"
                >
                    {['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].map(m => (
                        <option key={m} value={m}>{m.toUpperCase()}</option>
                    ))}
                </select>
                <div className="flex-1 bg-input border border-border-custom rounded px-3 py-1 flex items-center text-sm focus-within:border-accent transition-colors">
                    <span className="text-text-muted mr-1">/</span>
                    <input
                        type="text"
                        value={draftRoute.endpoint}
                        onChange={(e) => handleUpdateRoute({ endpoint: e.target.value })}
                        className="bg-transparent text-text-primary font-mono outline-none w-full"
                    />
                </div>

                {/* Response Mode Selector */}
                <div className="flex items-center gap-0.5 border-l border-border-custom pl-2 ml-2">
                    {RESPONSE_MODES.map((mode) => {
                        const isActive = draftRoute.responseMode === mode.value;
                        const isDisabled = mode.value === 'FALLBACK' && draftRoute.type === 'ws';

                        return (
                            <button
                                key={mode.label}
                                onClick={() => !isDisabled && handleUpdateRoute({ responseMode: mode.value })}
                                disabled={isDisabled}
                                className={`p-1.5 rounded transition-all ${isActive
                                    ? 'bg-accent/20 text-accent'
                                    : isDisabled
                                        ? 'text-text-disabled cursor-not-allowed'
                                        : 'text-text-secondary hover:text-text-primary hover:bg-hover'
                                    }`}
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
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-surface border border-border-custom rounded text-xs text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg min-w-[180px]">
                                        <div className="font-bold text-text-primary mb-1">{mode.label}</div>
                                        <div className="text-[11px] leading-relaxed">{mode.tooltip}</div>
                                        {/* Arrow */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-px border-4 border-transparent border-b-border-custom" />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {hasChanges ? (
                    <div className="flex items-center gap-2 ml-4 animate-in fade-in slide-in-from-right-4">
                        <button
                            onClick={handleDiscard}
                            disabled={isSaving}
                            className="px-3 py-1 text-[10px] font-bold uppercase text-text-secondary hover:text-text-primary transition-colors"
                        >
                            Discard
                        </button>
                        <button
                            onClick={persistSave}
                            disabled={isSaving}
                            className="bg-accent hover:bg-accent/90 text-white px-4 py-1 rounded text-[10px] font-bold uppercase shadow-lg shadow-accent/20 transition-all flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-white opacity-40 animate-pulse" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    Save Changes
                                    <span className="text-[8px] font-normal opacity-70 border border-white/30 rounded px-1">⌘S</span>
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-2 text-[10px] text-text-secondary font-medium uppercase tracking-widest border-l border-border-custom ml-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Synced
                    </div>
                )}
            </div>

            {/* 2. Response Selector & Actions */}
            <div className="px-4 py-2 bg-surface/30 border-b border-border-custom flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar py-1">
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

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAddResponse}
                        className="p-1.5 text-text-secondary hover:bg-hover hover:text-accent rounded transition-colors"
                        title="Add response"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        onClick={handleDeleteResponse}
                        disabled={route && route.responses.length <= 1}
                        className="p-1.5 text-text-secondary hover:bg-hover hover:text-red-400 rounded transition-colors disabled:opacity-30"
                        title="Delete current response"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 3. Tabs & Response Settings */}
            <div className="px-4 pt-4 border-b border-border-custom flex items-center justify-between bg-middle">
                <div className="flex gap-6">
                    {(['body', 'headers', 'rules', 'settings'] as const).map((tab) => {
                        // Check if rules tab should be disabled
                        const rulesDisablingModes = ['RANDOM', 'SEQUENTIAL', 'DISABLE_RULES'];
                        const isRulesDisabled = tab === 'rules' && rulesDisablingModes.includes(draftRoute.responseMode || '');

                        return (
                            <button
                                key={tab}
                                onClick={() => !isRulesDisabled && setActiveTab(tab)}
                                disabled={isRulesDisabled}
                                className={`text-[11px] font-bold uppercase tracking-wider pb-3 border-b-2 transition-colors ${isRulesDisabled
                                    ? 'text-text-disabled border-transparent cursor-not-allowed'
                                    : activeTab === tab
                                        ? 'text-accent border-accent'
                                        : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-custom'
                                    }`}
                                title={isRulesDisabled ? 'Rules are disabled by current response mode' : undefined}
                            >
                                {tab === 'body' ? 'Status & Body' : tab}
                                {isRulesDisabled && (
                                    <span className="ml-1 text-[9px] text-amber-500">⚠</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-4 text-xs pb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-text-secondary uppercase text-[10px] font-bold">Status</span>
                        <select
                            value={activeResponse.statusCode}
                            onChange={(e) => handleUpdateResponse({ statusCode: parseInt(e.target.value) })}
                            className="bg-surface px-2 py-1 rounded text-text-primary border border-border-custom w-48 focus:border-accent outline-none text-xs font-bold cursor-pointer"
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
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative group">
                            <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {/* Latency Tooltip - only shows when hovering the icon */}
                            <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-surface border border-border-custom rounded text-xs text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg min-w-[200px]">
                                <div className="font-bold text-text-primary mb-1">Response Latency</div>
                                <div className="text-[11px] leading-relaxed">Add artificial delay before the response is sent. Useful for testing loading states and slow network conditions.</div>
                                <div className="absolute bottom-full right-4 -mb-px border-4 border-transparent border-b-border-custom" />
                            </div>
                        </div>
                        <input
                            type="number"
                            value={activeResponse.latency}
                            onChange={(e) => handleUpdateResponse({ latency: parseInt(e.target.value) || 0 })}
                            className="bg-surface text-text-secondary font-mono w-16 px-2 py-1 rounded border border-transparent focus:border-accent outline-none focus:text-text-primary text-xs"
                            min="0"
                        />
                        <span className="text-text-secondary font-mono text-xs">ms</span>
                    </div>
                </div>
            </div>

            {/* 4. Tab Content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'body' && (
                    <div className="h-full flex flex-col p-4 animate-in fade-in duration-300">
                        <div className="mb-4 flex items-center justify-between">
                            <label className="text-sm font-medium text-text-secondary">Response Body</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleUpdateResponse({ bodyType: 'INLINE' })}
                                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase border transition-colors ${activeResponse.bodyType === 'INLINE' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-input border-border-custom text-text-secondary hover:text-text-primary'}`}
                                >
                                    Inline
                                </button>
                                <button
                                    onClick={() => handleUpdateResponse({ bodyType: 'FILE' })}
                                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase border transition-colors ${activeResponse.bodyType === 'FILE' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-input border-border-custom text-text-secondary hover:text-text-primary'}`}
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
                            <div className="p-8 border-2 border-dashed border-border-custom rounded-lg text-center">
                                <p className="text-text-secondary text-sm mb-4">File serving is available. Select a file from your disk.</p>
                                <input
                                    type="text"
                                    placeholder="File path..."
                                    value={activeResponse.filePath}
                                    onChange={(e) => handleUpdateResponse({ filePath: e.target.value })}
                                    className="w-full max-w-md bg-input border border-border-custom rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                                />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'headers' && (
                    <div className="animate-in fade-in duration-300">
                        <HeadersList
                            headers={activeResponse.headers}
                            onChange={(headers) => handleUpdateResponse({ headers })}
                        />
                    </div>
                )}

                {activeTab === 'rules' && (
                    <div className="animate-in fade-in duration-300">
                        <RulesList
                            rules={activeResponse.rules}
                            operator={activeResponse.rulesOperator}
                            onChange={(rules) => handleUpdateResponse({ rules })}
                            onOperatorChange={(rulesOperator) => handleUpdateResponse({ rulesOperator })}
                        />
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="p-6 space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-4 max-w-2xl">
                            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-widest">Response Settings</h3>

                            <div className="flex items-center justify-between p-3 bg-surface rounded-lg border border-border-custom">
                                <div>
                                    <p className="text-sm font-medium text-text-primary">Default Response</p>
                                    <p className="text-xs text-text-secondary">Serve this response if no other rules match.</p>
                                </div>
                                <button
                                    onClick={() => handleUpdateResponse({ default: !activeResponse.default })}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${activeResponse.default ? 'bg-accent' : 'bg-text-disabled'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${activeResponse.default ? 'right-1' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary uppercase">Response Label</label>
                                <input
                                    type="text"
                                    placeholder="Label for this response..."
                                    value={activeResponse.label}
                                    onChange={(e) => handleUpdateResponse({ label: e.target.value })}
                                    className="w-full bg-input border border-border-custom rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
