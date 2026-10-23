import { loadEnvironments } from '../../lib/data-dir';
import { findFreePort, getPortRange } from '../../lib/port-range';
import { getUiPort } from '../../lib/settings';

/** Allowed port range, the next free port and the ports already taken, for the port pickers. */
export async function GET() {
    try {
        const used = loadEnvironments().map(env => ({ port: env.port, name: env.name, filename: env.filename }));
        return Response.json({ ...getPortRange(), suggested: findFreePort(), uiPort: getUiPort(), used });
    } catch (error) {
        console.error('Error reading port range:', error);
        return Response.json({ error: 'Failed to read port range' }, { status: 500 });
    }
}
