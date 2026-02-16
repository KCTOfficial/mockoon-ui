# Project Coding Rules (Non-Obvious Only)

- PM2 must remain in `serverExternalPackages` in [`next.config.ts`](next.config.ts) - removing it will cause runtime failures
- Environment JSON files in `data/` must contain `uuid`, `name`, and `routes` properties to be recognized by the loader
- The `filename` property on Environment objects is added by the UI layer and should not be persisted to JSON files
- **DO NOT import from `mockoon/` directory** - use `@mockoon/commons` and `@mockoon/commons-server` npm packages instead
- Path alias `@/*` maps to project root - use for all imports (e.g., `@/types/mockoon`, `@/components/Dashboard`)