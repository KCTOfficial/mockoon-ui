import pm2 from 'pm2';
import util from 'util';
import fs from 'fs';

const connect = util.promisify(pm2.connect.bind(pm2));
const describe = util.promisify(pm2.describe.bind(pm2));
const disconnect = pm2.disconnect.bind(pm2);

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const skipHistory = searchParams.get('skipHistory') === 'true';

    if (!name) {
        return Response.json({ error: 'Process name required' }, { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const interval: NodeJS.Timeout | null = null;
            const watchers: fs.FSWatcher[] = [];

            try {
                await connect();
                const descriptions = await describe(name);
                // We don't disconnect immediately because we might need it? 
                // Actually descriptions has paths, so we can disconnect.
                disconnect();

                if (!descriptions || descriptions.length === 0) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Process not found' })}\n\n`));
                    controller.close();
                    return;
                }

                const proc = descriptions[0];
                const outPath = proc.pm2_env?.pm_out_log_path;
                const errPath = proc.pm2_env?.pm_err_log_path;

                const tailFile = (filePath: string, type: 'out' | 'error') => {
                    if (!filePath || !fs.existsSync(filePath)) return;

                    let lastSize = fs.statSync(filePath).size;

                    // Send last few lines initially unless skipping
                    if (!skipHistory) {
                        const initialContent = fs.readFileSync(filePath, 'utf-8');
                        const lines = initialContent.trim().split('\n').slice(-10);
                        lines.forEach(line => {
                            if (line) {
                                const data = { type, data: line + '\n', timestamp: new Date().toISOString() };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                            }
                        });
                    }

                    const watcher = fs.watch(filePath, (event) => {
                        if (event === 'change') {
                            try {
                                const stats = fs.statSync(filePath);
                                if (stats.size > lastSize) {
                                    const stream = fs.createReadStream(filePath, {
                                        start: lastSize,
                                        end: stats.size
                                    });
                                    stream.on('data', (chunk) => {
                                        const data = {
                                            type,
                                            data: chunk.toString(),
                                            timestamp: new Date().toISOString()
                                        };
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                                    });
                                    lastSize = stats.size;
                                } else if (stats.size < lastSize) {
                                    // File truncated/rotated
                                    lastSize = stats.size;
                                }
                            } catch (e) {
                                // Ignore errors during read
                            }
                        }
                    });
                    watchers.push(watcher);
                };

                if (outPath) tailFile(outPath, 'out');
                if (errPath) tailFile(errPath, 'error');

                req.signal.addEventListener('abort', () => {
                    watchers.forEach(w => w.close());
                    if (interval) clearInterval(interval);
                });

            } catch (error: any) {
                console.error('SSE Error:', error);
                controller.error(error);
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
