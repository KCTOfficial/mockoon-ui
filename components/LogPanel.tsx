'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { LogEntry } from '@/types/mockoon';

interface LogPanelProps {
    envName?: string;
    isOpen: boolean;
    onToggle: () => void;
    logEntries: LogEntry[];
}

// Pattern to match incoming HTTP requests in Mockoon log format
// JSON format: {"request":{"method":"post","urlPath":"/api/...
const JSON_REQUEST_PATTERN = /^\s*\{.*"request":\s*\{.*"method":\s*"(get|post|put|patch|delete|head|options)"/i;
// Simple format: "POST /path -> 200"
const SIMPLE_REQUEST_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i;

export default function LogPanel({ envName, isOpen, onToggle, logEntries }: LogPanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [copiedLog, setCopiedLog] = useState<number | null>(null);

    const copyToClipboard = async (text: string, index: number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedLog(index);
            setTimeout(() => setCopiedLog(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Filter logs to only show incoming requests
    const requestLogs = useMemo(() => {
        return logEntries.filter(log => {
            const data = log.data?.trim() || '';
            // Check if it's a JSON request log (Mockoon format)
            if (JSON_REQUEST_PATTERN.test(data)) return true;
            // Check if it's a simple request log (e.g., "POST /path -> 200")
            if (SIMPLE_REQUEST_PATTERN.test(data)) return true;
            return false;
        });
    }, [logEntries]);

    useEffect(() => {
        if (isOpen) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [requestLogs, isOpen]);

    const toggleExpand = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const parseLogData = (data: string | undefined) => {
        if (!data) return null;
        try {
            // Mockoon logs often contain JSON
            if (data.includes('{')) {
                const jsonStr = data.substring(data.indexOf('{'));
                return JSON.parse(jsonStr);
            }
        } catch (e) {
            // Ignore parse errors
        }
        return null;
    };

    if (!isOpen) {
        return (
            <div className="h-8 border-t border-border-custom bg-sidebar flex items-center justify-between px-4 cursor-pointer hover:bg-hover select-none flex-shrink-0" onClick={onToggle}>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Logs Viewer</span>
                    {envName && <span className="text-[10px] text-text-muted font-mono">[{envName}]</span>}
                </div>
                <div className="flex items-center gap-4 text-text-secondary">
                    <span className="text-[9px] font-mono">{requestLogs.length} requests</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                </div>
            </div>
        );
    }

    return (
        <div className="border-t border-border-custom bg-background flex flex-col h-full w-full overflow-hidden">
            <div
                className="h-9 bg-sidebar border-b border-border-custom px-4 flex items-center justify-between cursor-pointer hover:bg-hover select-none flex-shrink-0"
                onClick={onToggle}
            >
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-widest">Logs</span>
                    <span className="text-[10px] text-text-secondary font-mono bg-surface px-1.5 py-0.5 rounded border border-border-custom">{envName || 'All'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-text-secondary hover:text-text-primary p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-editor">
                {requestLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 space-y-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-[10px] text-text-muted italic">No requests recorded yet...</p>
                    </div>
                ) : (
                    <div className="flex flex-col divide-y divide-border-custom/30">
                        {requestLogs.map((log, i) => {
                            const parsed = parseLogData(log?.data);
                            const isExpanded = expandedLogs[i];
                            const isError = log.type === 'error';

                            return (
                                <div key={i} className={`p-2 transition-colors ${isExpanded ? 'bg-surface' : 'hover:bg-hover'}`}>
                                    <div
                                        className="flex items-center gap-3 cursor-pointer group"
                                        onClick={() => toggleExpand(i)}
                                    >
                                        <div className="w-16 shrink-0 text-[10px] font-mono text-text-secondary">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
                                        </div>
                                        <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase min-w-[40px] text-center ${isError ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                            {log.type || 'info'}
                                        </div>
                                        <div className="flex-1 text-[11px] font-mono text-text-primary truncate">
                                            {log.data?.trim() || ''}
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-text-secondary transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-3 ml-16 p-3 bg-input rounded border border-border-custom animate-in zoom-in-95 duration-200 relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const textToCopy = parsed ? JSON.stringify(parsed, null, 2) : (log.data || '');
                                                    copyToClipboard(textToCopy, i);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 rounded bg-surface hover:bg-hover border border-border-custom text-text-secondary hover:text-text-primary transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                {copiedLog === i ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                                    </svg>
                                                )}
                                            </button>
                                            {parsed ? (
                                                <pre className="text-[10px] text-text-secondary font-mono whitespace-pre-wrap pr-10">
                                                    {JSON.stringify(parsed, null, 2)}
                                                </pre>
                                            ) : (
                                                <pre className="text-[10px] text-text-secondary font-mono whitespace-pre-wrap pr-10 italic">
                                                    {log.data || ''}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div ref={bottomRef} className="h-4" />
            </div>
        </div>
    );
}
