# OpenAPI/Swagger Import Feature Plan

## Overview
Implement the ability to import OpenAPI (v3.x) and Swagger (v2.x) specification files and convert them to Mockoon environment format.

## Research Summary

### Mockoon's OpenAPI Converter (`@mockoon/commons`)
Location: `mockoon/packages/commons/src/libs/openapi-converter.ts`

Key capabilities:
- **Supported formats**: OpenAPI v3.x and Swagger v2.x
- **File formats**: JSON and YAML
- **Main method**: `convertFromOpenAPI(spec: string, port?: number): Promise<Environment | null>`

### Conversion Process
1. **Parse**: Convert JSON/YAML string to object
2. **Dereference**: Resolve all `$ref` references (internal and external URLs)
3. **Detect version**: Check for `swagger` (v2) or `openapi` (v3.x) property
4. **Convert**: Transform to Mockoon Environment structure

### What Gets Converted
- **Environment name**: From `info.title`
- **Port**: From `host` (v2) or `servers[0].url` (v3)
- **Endpoint prefix**: From `basePath` (v2) or `servers[0].url` pathname (v3)
- **Routes**: From `paths` object
  - HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
  - Route responses from `responses` object
  - Status codes
  - Response bodies from schema/examples
  - Headers
- **Documentation**: From `description` fields

### Key Dependencies
- `openapi-types`: TypeScript types for OpenAPI specifications
- `yaml`: YAML parsing library

## Implementation Plan

### Phase 1: Install Dependencies
```bash
npm install openapi-types yaml
```

### Phase 2: Create OpenAPI Converter Utility
Create `lib/openapi-converter.ts` based on Mockoon's implementation:
- Parse JSON/YAML
- Dereference $ref
- Convert to Mockoon environment format
- Handle both v2 and v3 specs

### Phase 3: Create API Endpoint
Create `app/api/environments/import-openapi/route.ts`:
- Accept file upload (JSON/YAML)
- Parse and validate OpenAPI spec
- Convert to Mockoon environment
- Save to data directory
- Return environment info

### Phase 4: Update UI
- Add "Import OpenAPI" button in Sidebar (separate from Mockoon JSON import)
- Create OpenAPI import modal with:
  - File upload (supports .json, .yaml, .yml)
  - Port override option
  - Preview of detected routes count
- Show success/error notifications

### Phase 5: Testing
- Test with sample OpenAPI v3 specs
- Test with sample Swagger v2 specs
- Test with YAML and JSON formats
- Test error handling for invalid specs

## Technical Details

### API Endpoint Request
```typescript
POST /api/environments/import-openapi
Content-Type: multipart/form-data

{
  file: File,           // OpenAPI/Swagger spec file
  port?: number         // Optional port override
}
```

### API Endpoint Response
```typescript
{
  success: boolean,
  environment: {
    uuid: string,
    name: string,
    port: number,
    routeCount: number,
    filename: string
  }
}
```

### Error Handling
- Invalid JSON/YAML format
- Not a valid OpenAPI/Swagger spec
- Missing required fields (info.title, paths, etc.)
- File too large
- Unsupported spec version

## Files to Create/Modify

### New Files
1. `lib/openapi-converter.ts` - OpenAPI to Mockoon conversion logic
2. `app/api/environments/import-openapi/route.ts` - API endpoint
3. `components/OpenAPIImportModal.tsx` - Import modal component

### Modified Files
1. `components/Sidebar.tsx` - Add OpenAPI import button
2. `components/Dashboard.tsx` - Handle OpenAPI import flow

## Estimated Effort
- OpenAPI Converter: ~2-3 hours (simplified version)
- API Endpoint: ~1 hour
- UI Components: ~1-2 hours
- Testing: ~1 hour

Total: ~5-7 hours

## Simplified Approach
For a quicker implementation, we can:
1. Use a simpler conversion that handles basic routes/responses
2. Skip complex schema generation (use empty bodies or examples if provided)
3. Focus on OpenAPI v3 first, add Swagger v2 later if needed
