import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment, DataBucket } from '@/types/mockoon';
import { v4 as uuidv4 } from 'uuid';

// Helper to generate a short ID for databuckets (4 chars)
const generateShortId = () => Math.random().toString(36).substring(2, 6);

export async function POST(req: NextRequest) {
    try {
        const { filename, action, dataBucket, dataBucketUuid } = await req.json();

        if (!filename) {
            return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        if (action === 'create') {
            const newBucket: DataBucket = {
                uuid: uuidv4(),
                id: dataBucket?.id || generateShortId(),
                name: dataBucket?.name || 'New data',
                documentation: dataBucket?.documentation || '',
                value: dataBucket?.value || '[\n]'
            };
            environment.data.push(newBucket);

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true, dataBucket: newBucket });
        }

        if (action === 'update') {
            if (!dataBucketUuid || !dataBucket) return NextResponse.json({ error: 'Missing dataBucketUuid or dataBucket data' }, { status: 400 });

            const index = environment.data.findIndex(d => d.uuid === dataBucketUuid);
            if (index === -1) return NextResponse.json({ error: 'Data bucket not found' }, { status: 404 });

            environment.data[index] = { ...environment.data[index], ...dataBucket };
            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        if (action === 'delete') {
            if (!dataBucketUuid) return NextResponse.json({ error: 'Missing dataBucketUuid' }, { status: 400 });

            environment.data = environment.data.filter(d => d.uuid !== dataBucketUuid);

            fs.writeFileSync(filePath, JSON.stringify(environment, null, 2), 'utf-8');
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('API Error managing data buckets:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
