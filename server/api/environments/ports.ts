import { findFreePort, getPortRange } from '../../lib/port-range';

/** Allowed port range and the next free port, used to prefill the "new environment" form. */
export async function GET() {
    try {
        return Response.json({ ...getPortRange(), suggested: findFreePort() });
    } catch (error) {
        console.error('Error reading port range:', error);
        return Response.json({ error: 'Failed to read port range' }, { status: 500 });
    }
}
