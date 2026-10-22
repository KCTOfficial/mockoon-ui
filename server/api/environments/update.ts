import fs from 'fs';
import { Environment } from '@/types/mockoon';
import { resolveEnvFile } from '../../lib/data-dir';

export async function POST(req: Request) {
    try {
        const { filename, updatedEnv } = await req.json();

        if (!filename || !updatedEnv) {
            return Response.json({ error: 'Missing required fields: filename, updatedEnv' }, { status: 400 });
        }

        const filePath = resolveEnvFile(filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return Response.json({ error: `File not found: ${filename}` }, { status: 404 });
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

        return Response.json({
            success: true,
            message: 'Environment updated successfully',
            environment: newEnv
        });
    } catch (error: any) {
        console.error('API Error updating environment:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
