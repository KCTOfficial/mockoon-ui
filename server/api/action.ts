import pm2 from 'pm2';
import path from 'path';

// Hanya huruf, angka, '_' dan '-'. Mencegah path traversal dan nama khusus PM2 seperti "all".
export const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

// Wrapper eksplisit: util.promisify hanya membaca overload terakhir PM2,
// sehingga tipe start()/connect() jadi salah dan build gagal.
const connect = () =>
    new Promise<void>((resolve, reject) => {
        pm2.connect((err) => (err ? reject(err) : resolve()));
    });

const start = (options: pm2.StartOptions) =>
    new Promise<pm2.Proc>((resolve, reject) => {
        pm2.start(options, (err, proc) => (err ? reject(err) : resolve(proc)));
    });

const stop = (name: string) =>
    new Promise<pm2.Proc>((resolve, reject) => {
        pm2.stop(name, (err, proc) => (err ? reject(err) : resolve(proc)));
    });

const list = () =>
    new Promise<pm2.ProcessDescription[]>((resolve, reject) => {
        pm2.list((err, procs) => (err ? reject(err) : resolve(procs)));
    });

const remove = (name: string) =>
    new Promise<void>((resolve, reject) => {
        pm2.delete(name, (err) => (err ? reject(err) : resolve()));
    });

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Stops a mock server and removes it from the PM2 list; a process that does not exist is not an error. */
export async function removeProcess(name: string) {
    if (!SAFE_NAME.test(name)) throw new Error('Invalid process name');
    await connect();
    try {
        await remove(name);
    } catch (e) {
        if (!errorMessage(e).includes('process or namespace not found')) throw e;
    } finally {
        pm2.disconnect();
    }
}

export async function POST(req: Request) {
    try {
        const { command, file, name } = await req.json();

        if (command === 'start') {
            // Hanya nama file .json polos di folder data, contoh "Bulcomp.json".
            const envName =
                typeof file === 'string' ? path.basename(file, path.extname(file)) : '';
            if (
                typeof file !== 'string' ||
                path.basename(file) !== file ||
                path.extname(file) !== '.json' ||
                !SAFE_NAME.test(envName)
            ) {
                return Response.json({ error: 'Invalid file' }, { status: 400 });
            }

            const dataFilePath = path.resolve(process.cwd(), 'data', file);

            await connect();
            try {
                await start({
                    script: path.resolve(process.cwd(), 'scripts/server.js'),
                    args: [dataFilePath],
                    name: envName, // nama proses PM2 = nama file tanpa ekstensi
                    force: true,
                });
                return Response.json({ message: 'Started', success: true });
            } catch (e) {
                console.error('PM2 Start Error:', e);
                return Response.json({ error: 'Failed to start process' }, { status: 500 });
            } finally {
                pm2.disconnect();
            }
        }

        if (command === 'stop') {
            if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
                return Response.json({ error: 'Invalid name' }, { status: 400 });
            }

            await connect();
            try {
                await stop(name);
                return Response.json({ message: 'Stopped', success: true });
            } catch (e) {
                if (errorMessage(e).includes('process or namespace not found')) {
                    return Response.json({ message: 'Process not running', success: true });
                }
                console.error('PM2 Stop Error:', e);
                return Response.json({ error: 'Failed to stop process' }, { status: 500 });
            } finally {
                pm2.disconnect();
            }
        }

        return Response.json({ error: 'Invalid command' }, { status: 400 });
    } catch (error) {
        pm2.disconnect();
        console.error('API Error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connect();
        const processList = await list();

        const processes = processList.map((proc) => ({
            name: proc.name,
            status: proc.pm2_env?.status, // 'online', 'stopped', 'errored'
            pid: proc.pid,
            uptime: proc.pm2_env?.pm_uptime,
            restarts: proc.pm2_env?.restart_time,
        }));

        return Response.json({ processes });
    } catch (error) {
        console.error('API Error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        pm2.disconnect();
    }
}
