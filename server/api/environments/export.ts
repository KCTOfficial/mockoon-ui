import fs from 'fs';
import { resolveEnvFile } from '../../lib/data-dir';

/**
 * Downloads an environment as a Mockoon environment file: the file in data/ as stored, so it can be
 * imported again here or opened in Mockoon. Only the UI's virtual `filename` field is dropped if present.
 */
export async function GET(req: Request) {
    try {
        const filename = new URL(req.url).searchParams.get('filename');
        const filePath = resolveEnvFile(filename);
        if (!filename || !filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: 'Environment not found' }, { status: 404 });
        }

        let content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content);
        if ('filename' in environment) {
            delete environment.filename;
            content = JSON.stringify(environment, null, 2);
        }

        // ASCII fallback plus the exact name for browsers that read filename*
        const asciiName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
        return new Response(content, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error exporting environment:', error);
        return Response.json({ error: 'Failed to export environment' }, { status: 500 });
    }
}
