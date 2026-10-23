import { useEffect, useState } from 'react';
import { PersonIcon, XIcon } from '@primer/octicons-react';
import PasswordInput from './shared/PasswordInput';

interface AccountButtonProps {
    notify: (message: string, type?: 'success' | 'error') => void;
}

interface AccountInfo {
    username: string | null;
    managedByEnv: boolean;
}

/** Header button opening the account dialog: change the login, or run the first-run setup again. */
export function AccountButton({ notify }: AccountButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [info, setInfo] = useState<AccountInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    // Change login
    const [username, setUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Run setup again (confirmed with the full login)
    const [showReset, setShowReset] = useState(false);
    const [resetUsername, setResetUsername] = useState('');
    const [resetPassword, setResetPassword] = useState('');

    const close = () => {
        if (!isPending) setIsOpen(false);
    };

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isPending) setIsOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, isPending]);

    // Fresh form each time the dialog opens; passwords are never kept between openings
    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowReset(false);
        setResetUsername('');
        setResetPassword('');
        fetch('/api/account')
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then((data: AccountInfo) => {
                setInfo(data);
                setUsername(data.username ?? '');
            })
            .catch(() => setError('Failed to load the account.'));
    }, [isOpen]);

    const passwordMismatch = confirmPassword !== '' && newPassword !== confirmPassword;

    const post = async (url: string, body: object) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed.');
        return data;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        setError(null);
        setIsPending(true);
        try {
            await post('/api/account', { currentPassword, username, newPassword });
            notify(newPassword ? 'Login updated. Other sessions were signed out.' : 'Username updated.');
            setIsPending(false);
            setIsOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update the login.');
            setIsPending(false);
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsPending(true);
        try {
            await post('/api/account/reset', { username: resetUsername, password: resetPassword });
            // The app now finds no setup and shows the setup page
            window.location.reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset the setup.');
            setIsPending(false);
        }
    };

    const locked = !info || info.managedByEnv || isPending;

    return (
        <>
            <button onClick={() => setIsOpen(true)} className="btn btn-icon" title="Account" aria-label="Account">
                <PersonIcon />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={close} />

                    {/* Dialog */}
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="account-title"
                        className="Overlay relative w-full max-w-md mx-4 max-h-[90vh] overflow-auto"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                            <h2 id="account-title" className="text-sm font-semibold text-fg-default">Account</h2>
                            <button onClick={close} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                                <XIcon />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}
                            {info?.managedByEnv && (
                                <div className="flash flash-warn text-[13px]">
                                    The login is set by MOCKOON_UI_USERNAME and MOCKOON_UI_PASSWORD in .env. Remove them and
                                    restart to manage it here.
                                </div>
                            )}

                            <form onSubmit={handleSave} className="space-y-4">
                                <div>
                                    <label htmlFor="account-username" className="form-label">Username</label>
                                    <input
                                        id="account-username"
                                        type="text"
                                        autoComplete="username"
                                        required
                                        maxLength={64}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        disabled={locked}
                                        className="form-control w-full"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="account-new-password" className="form-label">New password</label>
                                    <PasswordInput
                                        id="account-new-password"
                                        value={newPassword}
                                        onChange={setNewPassword}
                                        disabled={locked}
                                        required={false}
                                        minLength={8}
                                        placeholder="Leave empty to keep the current one"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="account-confirm-password" className="form-label">Confirm new password</label>
                                    <PasswordInput
                                        id="account-confirm-password"
                                        value={confirmPassword}
                                        onChange={setConfirmPassword}
                                        disabled={locked}
                                        required={newPassword !== ''}
                                        invalid={passwordMismatch}
                                        describedBy={passwordMismatch ? 'account-password-mismatch' : undefined}
                                    />
                                    {passwordMismatch && (
                                        <p id="account-password-mismatch" role="alert" className="form-caption text-danger">
                                            Passwords do not match.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="account-current-password" className="form-label">Current password</label>
                                    <PasswordInput
                                        id="account-current-password"
                                        value={currentPassword}
                                        onChange={setCurrentPassword}
                                        disabled={locked}
                                        autoComplete="current-password"
                                    />
                                    <p className="form-caption">
                                        Forgot it? Set MOCKOON_UI_USERNAME and MOCKOON_UI_PASSWORD in .env and restart.
                                    </p>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" disabled={locked || passwordMismatch} className="btn btn-sm btn-primary">
                                        {isPending && !showReset ? 'Saving…' : 'Save login'}
                                    </button>
                                </div>
                            </form>

                            <div className="Box !border-danger-emphasis p-3 space-y-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-fg-default">Run setup again</h3>
                                    <p className="text-xs text-fg-muted mt-1">
                                        Deletes the saved login and port settings, signs everyone out and shows the setup page.
                                        Environments and running mock servers are kept. Until the setup is completed again,
                                        anyone who opens the UI can fill it in.
                                    </p>
                                </div>
                                {!showReset ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowReset(true)}
                                        disabled={isPending}
                                        className="btn btn-sm btn-danger"
                                    >
                                        Run setup again…
                                    </button>
                                ) : (
                                    <form onSubmit={handleReset} className="space-y-3">
                                        <p className="text-xs text-fg-default">Type your username and password to confirm.</p>
                                        <input
                                            aria-label="Confirm username"
                                            type="text"
                                            autoComplete="off"
                                            required
                                            autoFocus
                                            placeholder="Username"
                                            value={resetUsername}
                                            onChange={(e) => setResetUsername(e.target.value)}
                                            disabled={isPending}
                                            className="form-control w-full"
                                        />
                                        <PasswordInput
                                            id="account-reset-password"
                                            value={resetPassword}
                                            onChange={setResetPassword}
                                            disabled={isPending}
                                            autoComplete="current-password"
                                            placeholder="Password"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowReset(false)}
                                                disabled={isPending}
                                                className="btn btn-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isPending || !resetUsername || !resetPassword}
                                                className="btn btn-sm btn-danger-solid"
                                            >
                                                {isPending ? 'Resetting…' : 'Reset and run setup'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
