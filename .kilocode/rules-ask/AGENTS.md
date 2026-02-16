# Project Documentation Rules (Non-Obvious Only)

- **DO NOT import from `mockoon/` directory** - it contains upstream Mockoon source code for reference only, not part of this project's codebase
- Use `@mockoon/commons` and `@mockoon/commons-server` npm packages instead of importing from `mockoon/`
- Environment JSON files in `data/` are loaded at server startup by [`app/page.tsx`](app/page.tsx) - new files require server restart
- OpenAPI import functionality is in [`lib/openapi-converter.ts`](lib/openapi-converter.ts) - supports both OpenAPI 3.x and Swagger 2.x
- Type definitions in [`types/mockoon.ts`](types/mockoon.ts) mirror `@mockoon/commons` types with UI-specific additions