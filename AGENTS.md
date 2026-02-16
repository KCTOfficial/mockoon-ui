# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build Commands
```bash
bun run dev      # Development server (http://localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
```

No test framework is configured.

## Architecture Overview

This is a Next.js 16 app for managing Mockoon mock API environments.

**Key Entry Points:**
- [`app/page.tsx`](app/page.tsx) - Server component that loads environments from `data/` directory
- [`components/Dashboard.tsx`](components/Dashboard.tsx) - Main client component managing all state
- [`scripts/server.js`](scripts/server.js) - Mockoon server wrapper launched by PM2

**Critical Patterns:**
- Environment JSON files are stored in `data/` directory and must have `uuid`, `name`, and `routes` properties
- PM2 is configured as external package in [`next.config.ts`](next.config.ts) - required for server process management
- The `filename` property on Environment is a virtual field added by UI, not part of Mockoon spec
- Log streaming uses EventSource via `/api/logs/stream` route

**API Routes:**
- `/api/action` - PM2 process control (start/stop mock servers)
- `/api/environments/*` - CRUD operations for environments, routes, responses, callbacks, databuckets
- `/api/logs/stream` - SSE endpoint for real-time log streaming

**Type Definitions:**
- [`types/mockoon.ts`](types/mockoon.ts) - All Mockoon types (Environment, Route, Response, etc.)
- Path alias `@/*` maps to project root (configured in tsconfig.json)

**Important:**
- The `mockoon/` directory contains upstream Mockoon source for reference only - do not import from it, use `@mockoon/commons` and `@mockoon/commons-server` npm packages instead
