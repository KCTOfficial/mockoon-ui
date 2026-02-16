# Response Mode Feature Implementation Plan

## Overview

Add the **Response Mode** feature to the Mockoon CLI UI application. This feature controls how multiple responses are served when a route has more than one response configured.

## Response Mode Types

Based on the Mockoon source code analysis ([`mockoon/packages/commons/src/models/route.model.ts`](mockoon/packages/commons/src/models/route.model.ts:35)):

| Mode | Value | Description |
|------|-------|-------------|
| **Rules** | `null` | Default behavior - rules determine which response to serve |
| **Random** | `RANDOM` | Randomly selects a response on each request (disables rules) |
| **Sequential** | `SEQUENTIAL` | Cycles through responses in order (disables rules) |
| **Disable Rules** | `DISABLE_RULES` | Always serves the default response (ignores rules) |
| **Fallback** | `FALLBACK` | If no rules match, jumps to next route or proxy instead of serving default |

## Current State Analysis

### Already Implemented
- [`types/mockoon.ts`](types/mockoon.ts:5) - `ResponseMode` type already defined
- [`types/mockoon.ts`](types/mockoon.ts:54) - `Route` interface includes `responseMode` field
- Data files already contain `responseMode` values (e.g., [`data/Bulcomp.json`](data/Bulcomp.json:146))

### Needs Implementation
1. **UI Component** - Add response mode selector to RouteEditor
2. **API Update** - Handle `responseMode` in save operations
3. **Visual Feedback** - Show current mode status and disable rules tab when appropriate

## Implementation Steps

### Step 1: Add Response Mode Constants
**File:** [`components/RouteEditor.tsx`](components/RouteEditor.tsx)

Add a constants array for response mode options with icons, labels, and tooltips:
```typescript
const RESPONSE_MODES = [
    { value: null, icon: 'rule', label: 'Rules', tooltip: 'Default behavior...' },
    { value: 'RANDOM', icon: 'shuffle', label: 'Random', tooltip: '...' },
    { value: 'SEQUENTIAL', icon: 'repeat', label: 'Sequential', tooltip: '...' },
    { value: 'DISABLE_RULES', icon: 'rule_disabled', label: 'No Rules', tooltip: '...' },
    { value: 'FALLBACK', icon: 'low_priority', label: 'Fallback', tooltip: '...' }
];
```

### Step 2: Add Response Mode Selector UI
**File:** [`components/RouteEditor.tsx`](components/RouteEditor.tsx)

Add a toggle button group in the route header section (after the endpoint input, before save buttons):

```tsx
{/* Response Mode Selector */}
<div className="flex items-center gap-1 px-2 border-l border-zinc-700 ml-2">
    {RESPONSE_MODES.map((mode) => (
        <button
            key={mode.label}
            onClick={() => handleUpdateRoute({ responseMode: mode.value })}
            className={`p-1.5 rounded transition-colors ${
                draftRoute.responseMode === mode.value
                    ? 'bg-accent/20 text-accent'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
            title={mode.tooltip}
        >
            {/* Icon SVG based on mode.icon */}
        </button>
    ))}
</div>
```

### Step 3: Add Icon Components
**File:** [`components/RouteEditor.tsx`](components/RouteEditor.tsx)

Create icon components for each response mode:
- `shuffle` - Random mode icon
- `repeat` - Sequential mode icon  
- `rule` - Rules enabled icon
- `rule_disabled` - Rules disabled icon
- `low_priority` - Fallback mode icon

### Step 4: Update API to Persist responseMode
**File:** [`app/api/environments/update-route/route.ts`](app/api/environments/update-route/route.ts)

Update the API to accept and save `responseMode` field:
```typescript
updatedRoute: {
    endpoint: draftRoute.endpoint,
    method: draftRoute.method,
    responseMode: draftRoute.responseMode  // Add this
}
```

### Step 5: Conditional Rules Tab
**File:** [`components/RouteEditor.tsx`](components/RouteEditor.tsx)

Disable or hide the "Rules" tab when response mode disables rules:
```typescript
const rulesDisabled = ['RANDOM', 'SEQUENTIAL', 'DISABLE_RULES'].includes(draftRoute.responseMode);
```

Update the rules tab button to show disabled state with tooltip.

### Step 6: Visual Indicator for Default Response
**File:** [`components/RouteEditor.tsx`](components/RouteEditor.tsx)

Update the default response indicator tooltip based on response mode:
- `RANDOM`/`SEQUENTIAL`: "Default response disabled by random/sequential responses"
- `DISABLE_RULES`: "Default response always served as rules are disabled"
- `FALLBACK`: "Default response not served if no rules match"

## UI Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [POST] [/api/endpoint________________] [🔀][🔁][🚫][↪] │ <Save> │
│                                        ↑ Response Mode Toggles          │
├─────────────────────────────────────────────────────────────────────────┤
│ [Response 1 (200)] [Response 2 (404)] [+] [-]                          │
├─────────────────────────────────────────────────────────────────────────┤
│ [Status & Body] [Headers] [Rules*] [Settings]     Status: [200 ▼] 0ms │
│                              ↑ Disabled when mode disables rules        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Files to Modify

| File | Changes |
|------|---------|
| [`components/RouteEditor.tsx`](components/RouteEditor.tsx) | Add response mode selector UI, icons, conditional rules tab |
| [`app/api/environments/update-route/route.ts`](app/api/environments/update-route/route.ts) | Include `responseMode` in save operation |
| [`types/mockoon.ts`](types/mockoon.ts) | Already has `ResponseMode` type ✓ |

## Testing Checklist

- [ ] Response mode selector renders correctly
- [ ] Clicking mode buttons updates the route
- [ ] Changes persist after save
- [ ] Rules tab shows disabled state when appropriate
- [ ] Tooltips display correct information
- [ ] Page refresh maintains selected mode

## Reference

- Mockoon original implementation: [`mockoon/packages/app/src/renderer/app/components/environment-routes/environment-routes.component.ts`](mockoon/packages/app/src/renderer/app/components/environment-routes/environment-routes.component.ts:255)
- Response mode enum: [`mockoon/packages/commons/src/models/route.model.ts`](mockoon/packages/commons/src/models/route.model.ts:35)
