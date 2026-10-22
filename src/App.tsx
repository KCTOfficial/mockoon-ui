import { useCallback, useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';
import { Environment } from '@/types/mockoon';

type AppState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'login'; configured: boolean }
    | { status: 'ready'; environments: Environment[] };

export default function App() {
    const [state, setState] = useState<AppState>({ status: 'loading' });

    const load = useCallback(async () => {
        try {
            const session = await fetch('/api/auth/session').then(r => r.json());
            if (!session.authenticated) {
                setState({ status: 'login', configured: session.configured });
                return;
            }

            const res = await fetch('/api/environments');
            if (res.status === 401) {
                setState({ status: 'login', configured: true });
                return;
            }
            if (!res.ok) throw new Error('Failed to load environments');
            const data = await res.json();
            setState({ status: 'ready', environments: data.environments });
        } catch (error) {
            setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to reach the server' });
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setState({ status: 'login', configured: true });
    };

    if (state.status === 'loading') {
        return (
            <div className="h-full flex items-center justify-center text-fg-muted text-sm">
                Loading…
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <div className="h-full flex items-center justify-center px-4">
                <div className="flash flash-error max-w-md w-full items-center justify-between">
                    <span>{state.message}</span>
                    <button className="btn btn-sm" onClick={load}>Retry</button>
                </div>
            </div>
        );
    }

    if (state.status === 'login') {
        return <LoginPage configured={state.configured} onLoggedIn={load} />;
    }

    return <Dashboard initialEnvironments={state.environments} onLogout={handleLogout} />;
}
