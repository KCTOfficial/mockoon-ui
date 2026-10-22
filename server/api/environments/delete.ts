import fs from 'fs';
import path from 'path';
import { getDataDir, resolveEnvFile } from '../../lib/data-dir';
import { SAFE_NAME, removeProcess } from '../action';

/**
 * Deletes an environment: stops and removes its mock server from PM2, then moves the file to
 * data/.deleted/ (not loaded by the UI) so it can still be recovered by moving it back.
 */
export async function POST(req: Request) {
    try {
        const { filename } = await req.json();

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'File not found' }, { status: 404 });
        }

        // PM2 process name = file name without extension (see action.ts); other names can never have been started
        const processName = path.basename(filePath, '.json');
        if (SAFE_NAME.test(processName)) {
            await removeProcess(processName);
        }

        const trashDir = path.join(getDataDir(), '.deleted');
        fs.mkdirSync(trashDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const trashPath = path.join(trashDir, `${processName}-${stamp}.json`);
        fs.renameSync(filePath, trashPath);

        return Response.json({ success: true, movedTo: path.relative(process.cwd(), trashPath) });
    } catch (error) {
        console.error('API Error deleting environment:', error);
        return Response.json({ error: 'Failed to delete environment' }, { status: 500 });
    }
}
