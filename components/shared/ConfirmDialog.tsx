import { ReactNode, useEffect, useState } from 'react';
import { XIcon } from '@primer/octicons-react';

interface ConfirmDialogProps {
    title: string;
    children: ReactNode;
    confirmLabel: string;
    pendingLabel?: string;
    onConfirm: () => Promise<void> | void;
    onCancel: () => void;
}

/** Confirmation for destructive actions; render it only while the confirmation is needed. */
export default function ConfirmDialog({ title, children, confirmLabel, pendingLabel, onConfirm, onCancel }: ConfirmDialogProps) {
    const [isPending, setIsPending] = useState(false);

    const cancel = () => {
        if (!isPending) onCancel();
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isPending, onCancel]);

    const confirm = async () => {
        setIsPending(true);
        try {
            await onConfirm();
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={cancel} />
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="Overlay relative w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="confirm-dialog-title" className="text-sm font-semibold text-fg-default">{title}</h2>
                    <button onClick={cancel} disabled={isPending} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>
                <div className="p-4 text-sm text-fg-muted">{children}</div>
                <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                    <button onClick={cancel} disabled={isPending} className="btn btn-sm">
                        Cancel
                    </button>
                    <button onClick={confirm} disabled={isPending} className="btn btn-sm btn-danger-solid" autoFocus>
                        {isPending ? (pendingLabel ?? 'Deleting…') : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
