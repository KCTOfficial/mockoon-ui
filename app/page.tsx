import Dashboard from '@/components/Dashboard';
import { Environment } from '@/types/mockoon';
import fs from 'fs';
import path from 'path';

async function getEnvironments(): Promise<Environment[]> {
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

  return files.map(file => {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      const parsed = JSON.parse(content);
      // Only load files that have the Mockoon environment structure
      if (parsed.uuid && parsed.name && parsed.routes !== undefined) {
        return { ...parsed, filename: file } as Environment;
      }
      return null;
    } catch {
      return null;
    }
  }).filter((env): env is Environment => env !== null);
}

export default async function Home() {
  const environments = await getEnvironments();

  return (
    <main className="min-h-screen bg-black">
      <Dashboard initialEnvironments={environments} />
    </main>
  );
}
