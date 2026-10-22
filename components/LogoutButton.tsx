import { useEffect, useState } from 'react';
import { SignOutIcon, XIcon } from '@primer/octicons-react';

export function LogoutButton({ onLogout }: { onLogout: () => Promise<void> }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) setIsOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, isPending]);

    const close = () => {
        if (!isPending) setIsOpen(false);
    };

    const handleLogout = async () => {
        setIsPending(true);
        try {
            await onLogout();
        } finally {
            setIsPending(false);
        }
    };

    return (
        <>
            <button onClick={() => setIsOpen(true)} className="btn btn-icon" title="Sign out" aria-label="Sign out">
                <SignOutIcon />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={close} />

                    {/* Dialog */}
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="logout-title"
                        className="Overlay relative w-full max-w-sm mx-4"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                            <h2 id="logout-title" className="text-sm font-semibold text-fg-default">Sign out</h2>
                            <button onClick={close} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                                <XIcon />
                            </button>
                        </div>

                        <div className="p-4">
                            <p className="text-sm text-fg-muted">
                                Are you sure you want to sign out? Running mock servers will keep running.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                            <button type="button" onClick={close} disabled={isPending} className="btn btn-sm">
                                Cancel
                            </button>
                            <button
                                type="button"
                                autoFocus
                                onClick={handleLogout}
                                disabled={isPending}
                                className="btn btn-sm btn-danger-solid"
                            >
                                {isPending ? 'Signing out…' : 'Sign out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
