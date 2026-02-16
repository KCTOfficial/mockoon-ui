# Project Architecture Rules (Non-Obvious Only)

- [`components/Dashboard.tsx`](components/Dashboard.tsx) is the central state manager - all environment/route state flows through here
- Server-side environment loading in [`app/page.tsx`](app/page.tsx) is static - changes to `data/` directory require server restart to reflect
- PM2 manages Mockoon server processes externally to Next.js - each environment runs as separate PM2 process named after its filename
- API routes under `/api/environments/*` handle CRUD operations - they read/write directly to JSON files in `data/` directory
- Log streaming architecture: Mockoon server (`scripts/server.js`) -> stdout -> PM2 -> API route (`/api/logs/stream`) -> EventSource -> client
- **`mockoon/` directory is reference-only** - not part of the build, do not import from it