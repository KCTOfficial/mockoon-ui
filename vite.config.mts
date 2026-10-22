import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT) || 7099;

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': import.meta.dirname },
    },
    server: {
        port: 7001,
        // Dev only: the Hono API runs separately (npm run dev:api)
        proxy: {
            '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false },
        },
    },
    build: {
        outDir: 'dist/client',
        emptyOutDir: true,
    },
});
