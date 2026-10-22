import { useEffect, useRef, useState, useMemo } from 'react';
import { LogEntry } from '@/types/mockoon';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, PulseIcon } from '@primer/octicons-react';

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
            <div
                className="h-8 border-t border-border-custom bg-canvas-muted flex items-center justify-between px-4 cursor-pointer hover:bg-[var(--btn-hover-bg)] select-none flex-shrink-0"
                onClick={onToggle}
            >
                <div className="flex items-center gap-2 text-xs">
                    <PulseIcon size={14} className="text-accent" />
                    <span className="font-semibold text-fg-default">Request logs</span>
                    {envName && <span className="text-fg-muted font-mono">{envName}</span>}
                </div>
                <div className="flex items-center gap-3 text-fg-muted">
                    <span className="Counter">{requestLogs.length}</span>
                    <ChevronUpIcon size={14} />
                </div>
            </div>
        );
    }

    return (
        <div className="border-t border-border-custom bg-canvas flex flex-col h-full w-full overflow-hidden">
            <div
                className="h-9 bg-canvas-muted border-b border-border-custom px-4 flex items-center justify-between cursor-pointer hover:bg-[var(--btn-hover-bg)] select-none flex-shrink-0"
                onClick={onToggle}
            >
                <div className="flex items-center gap-2 text-xs">
                    <PulseIcon size={14} className="text-accent" />
                    <span className="font-semibold text-fg-default">Request logs</span>
                    <span className="Label !h-[18px] text-[11px] font-mono text-fg-muted">{envName || 'All'}</span>
                    <span className="Counter">{requestLogs.length}</span>
                </div>
                <button className="btn btn-invisible btn-icon btn-sm !w-6 !h-6" aria-label="Collapse logs">
                    <ChevronDownIcon size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-auto bg-canvas">
                {requestLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-fg-muted space-y-2">
                        <PulseIcon size={24} />
                        <p className="text-xs">No requests recorded yet</p>
                    </div>
                ) : (
                    <div className="flex flex-col divide-y divide-border-muted">
                        {requestLogs.map((log, i) => {
                            const parsed = parseLogData(log?.data);
                            const isExpanded = expandedLogs[i];
                            const isError = log.type === 'error';

                            return (
                                <div key={i} className={`px-4 py-1.5 ${isExpanded ? 'bg-canvas-muted' : 'hover:bg-canvas-muted'}`}>
                                    <div
                                        className="flex items-center gap-3 cursor-pointer group"
                                        onClick={() => toggleExpand(i)}
                                    >
                                        <div className="w-16 shrink-0 text-xs font-mono text-fg-muted">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
                                        </div>
                                        <span className={`Label !h-[18px] text-[11px] min-w-[44px] justify-center ${isError ? 'text-danger border-danger-muted' : 'text-accent border-accent-muted'}`}>
                                            {log.type || 'info'}
                                        </span>
                                        <div className="flex-1 text-xs font-mono text-fg-default truncate">
                                            {log.data?.trim() || ''}
                                        </div>
                                        <ChevronDownIcon size={14} className={`text-fg-muted opacity-0 group-hover:opacity-100 transition-transform ${isExpanded ? 'rotate-180 opacity-100' : ''}`} />
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-2 mb-1 ml-[76px] p-3 bg-canvas-inset rounded-md border border-border-custom relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const textToCopy = parsed ? JSON.stringify(parsed, null, 2) : (log.data || '');
                                                    copyToClipboard(textToCopy, i);
                                                }}
                                                className="btn btn-icon btn-sm absolute top-2 right-2"
                                                title="Copy to clipboard"
                                                aria-label="Copy to clipboard"
                                            >
                                                {copiedLog === i ? <CheckIcon className="text-success" /> : <CopyIcon />}
                                            </button>
                                            <pre className={`text-xs font-mono whitespace-pre-wrap pr-10 ${parsed ? 'text-fg-default' : 'text-fg-muted'}`}>
                                                {parsed ? JSON.stringify(parsed, null, 2) : (log.data || '')}
                                            </pre>
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
