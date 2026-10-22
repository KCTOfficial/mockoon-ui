import { useState } from 'react';
import logo from '@/images/logo.png';

interface LoginPageProps {
    configured: boolean;
    onLoggedIn: () => void;
}

export default function LoginPage({ configured, onLoggedIn }: LoginPageProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsPending(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Sign in failed.');
                return;
            }
            onLoggedIn();
        } catch {
            setError('Unable to reach the server.');
        } finally {
            setIsPending(false);
        }
    };

    const disabled = !configured || isPending;

    return (
        <main className="min-h-full flex flex-col items-center bg-canvas-muted px-4 pt-16">
            <div className="flex flex-col items-center mb-6 text-fg-default">
                {/* The logo mixes dark shapes and white details on a transparent background; an accent tile keeps both visible in either theme */}
                <span className="w-20 h-20 rounded-2xl bg-accent-emphasis flex items-center justify-center">
                    <img src={logo} alt="Mockoon UI" className="w-[72px] h-[72px] object-contain" />
                </span>
                <h1 className="mt-6 text-2xl font-light tracking-tight">Sign in to Mockoon UI</h1>
            </div>

            <div className="w-full max-w-[340px] space-y-4">
                {!configured && (
                    <div className="flash flash-error text-[13px]">
                        Login is not configured. Set MOCKOON_UI_USERNAME, MOCKOON_UI_PASSWORD and MOCKOON_UI_AUTH_SECRET on the server.
                    </div>
                )}
                {error && (
                    <div role="alert" className="flash flash-error text-[13px]">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="Box bg-canvas-muted p-4 space-y-4">
                    <div>
                        <label htmlFor="username" className="form-label font-normal">Username</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            autoFocus
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={disabled}
                            className="form-control w-full"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="form-label font-normal">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={disabled}
                            className="form-control w-full"
                        />
                    </div>

                    <button type="submit" disabled={disabled} className="btn btn-primary w-full">
                        {isPending ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </main>
    );
}
