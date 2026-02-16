import { NextRequest, NextResponse } from 'next/server';
import pm2 from 'pm2';
import path from 'path';
import util from 'util';

// Promisify PM2 methods
const connect = util.promisify(pm2.connect.bind(pm2));
const start = util.promisify(pm2.start.bind(pm2));
const stop = util.promisify(pm2.stop.bind(pm2));
const list = util.promisify(pm2.list.bind(pm2));
// disconnect is sync-ish or callback based but we usually don't need to await it much, or just leave connection open?
// Better to disconnect to not leak.
const disconnect = pm2.disconnect.bind(pm2);

export async function POST(req: NextRequest) {
    try {
        const { command, file, name } = await req.json();

        await connect();

        if (command === 'start') {
            if (!file) {
                disconnect();
                return NextResponse.json({ error: 'File path required' }, { status: 400 });
            }

            // We assume file is relative to data dir if not absolute, 
            // but here we expect just filename like "Bulcomp.json" based on frontend.
            // Let's resolve it carefully.
            const dataFilePath = path.resolve(process.cwd(), 'data', file);
            // We use the file basename without extension as the PM2 process name
            // e.g. "Bulcomp"
            const envName = path.basename(file, path.extname(file));

            try {
                await start({
                    script: path.resolve(process.cwd(), 'scripts/server.js'),
                    args: [dataFilePath],
                    name: envName,
                    force: true, // If already exists, restart? Or maybe checking list first is better.
                    // If we use force: true it might restart.
                });
                disconnect();
                return NextResponse.json({ message: 'Started', success: true });
            } catch (e: any) {
                disconnect();
                console.error('PM2 Start Error:', e);
                return NextResponse.json({ error: e.message }, { status: 500 });
            }
        }

        if (command === 'stop') {
            if (!name) {
                disconnect();
                return NextResponse.json({ error: 'Name required' }, { status: 400 });
            }

            try {
                await stop(name);
                disconnect();
                return NextResponse.json({ message: 'Stopped', success: true });
            } catch (e: any) {
                disconnect();
                // Ignore specific error if process not found?
                if (e.message && e.message.includes('process or namespace not found')) {
                    return NextResponse.json({ message: 'Process not running', success: true });
                }
                return NextResponse.json({ error: e.message }, { status: 500 });
            }
        }

        disconnect();
        return NextResponse.json({ error: 'Invalid command' }, { status: 400 });
    } catch (error: any) {
        disconnect();
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connect();
        const processList = await list();
        disconnect();

        const processes = processList.map((proc: any) => ({
            name: proc.name,
            status: proc.pm2_env.status, // 'online', 'stopped', 'errored'
            pid: proc.pid,
            uptime: proc.pm2_env.pm_uptime,
            restarts: proc.pm2_env.restart_time
        }));

        return NextResponse.json({ processes });
    } catch (error: any) {
        disconnect();
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
