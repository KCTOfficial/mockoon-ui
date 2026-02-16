import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Environment } from '@/types/mockoon';

export async function POST(req: NextRequest) {
    try {
        const { filename, updatedEnv } = await req.json();

        if (!filename || !updatedEnv) {
            return NextResponse.json({ error: 'Missing required fields: filename, updatedEnv' }, { status: 400 });
        }

        const dataDir = path.join(process.cwd(), 'data');
        const filePath = path.join(dataDir, filename);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: `File not found: ${filename}` }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const environment = JSON.parse(content) as Environment;

        // Perform shallow merge for top-level fields
        // We exclude collections like routes, folders, data, callbacks here 
        // because they should be handled by specialized sub-resource APIs if they are complex,
        // but for now we allow updating everything in this root API for simplicity if the user sends it.

        const newEnv = {
            ...environment,
            ...updatedEnv
        };

        // Note: we should ideally validate the schema here using Joi or Zod
        // matching what we found in @mockoon/commons

        fs.writeFileSync(filePath, JSON.stringify(newEnv, null, 2), 'utf-8');

        return NextResponse.json({
            success: true,
            message: 'Environment updated successfully',
            environment: newEnv
        });
    } catch (error: any) {
        console.error('API Error updating environment:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
