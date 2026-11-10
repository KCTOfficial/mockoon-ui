import { useEffect } from 'react';
import { AlertIcon, CheckCircleIcon, XIcon } from '@primer/octicons-react';

interface WarningsDialogProps {
    title: string;
    /** What was done, e.g. "Copied 3 routes to Demo Shop API." */
    summary: string;
    warnings: string[];
    onClose: () => void;
}

/** Shown after an action that succeeded but left things worth checking (duplicate endpoints, bucket clashes). */
export default function WarningsDialog({ title, summary, warnings, onClose }: WarningsDialogProps) {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-labelledby="warnings-title" className="Overlay relative w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="warnings-title" className="text-sm font-semibold text-fg-default">{title}</h2>
                    <button onClick={onClose} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="flash text-[13px] flex items-start gap-2">
                        <CheckCircleIcon className="text-success mt-0.5 flex-shrink-0" />
                        <span>{summary} {warnings.length} thing{warnings.length === 1 ? '' : 's'} to check:</span>
                    </div>
                    <ul className="space-y-2">
                        {warnings.map(warning => (
                            <li key={warning} className="flash flash-warn text-[13px] flex items-start gap-2">
                                <AlertIcon className="mt-0.5 flex-shrink-0" />
                                <span className="min-w-0 break-words">{warning}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex justify-end px-4 py-3 border-t border-border-muted">
                    <button onClick={onClose} className="btn btn-sm btn-primary" autoFocus>Done</button>
                </div>
            </div>
        </div>
    );
}
