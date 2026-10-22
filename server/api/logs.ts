import pm2 from 'pm2';
import util from 'util';
import fs from 'fs';
import path from 'path';

const connect = util.promisify(pm2.connect.bind(pm2));
const describe = util.promisify(pm2.describe.bind(pm2));
const disconnect = pm2.disconnect.bind(pm2);

function readLastLines(filePath: string, lineCount: number = 50): string {
    if (!fs.existsSync(filePath)) return '';
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        return lines.slice(-lineCount).join('\n');
    } catch (e) {
        return 'Error reading log file';
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');

    if (!name) {
        return Response.json({ error: 'Environment name required' }, { status: 400 });
    }

    try {
        await connect();
        const descriptions = await describe(name);
        disconnect();

        if (!descriptions || descriptions.length === 0) {
            return Response.json({ error: 'Process not found' }, { status: 404 });
        }

        const process = descriptions[0];
        const pm2_env = process.pm2_env;

        if (!pm2_env) {
            return Response.json({ out: '', err: '' });
        }

        const outLogPath = pm2_env.pm_out_log_path;
        const errLogPath = pm2_env.pm_err_log_path;

        const out = outLogPath ? readLastLines(outLogPath) : '';
        const err = errLogPath ? readLastLines(errLogPath) : '';

        return Response.json({ out, err });
    } catch (error: any) {
        disconnect();
        return Response.json({ error: error.message }, { status: 500 });
    }
}
