# Unit 07: Split State, Events, And Rendering

## Goal

Turn `popup/main.ts` into a thin popup shell by splitting state management, event wiring, DOM references, and rendering into focused modules.

## Why This Comes Seventh

Do this after parser and workflow extraction. Rendering code is broad and event-handler risk is high, so it should move only after business logic is already isolated and tested.

## Current State

`popup/main.ts` currently owns:

- initial app state
- persisted preference loading/saving
- workspace switching
- event listener setup
- every render function
- row/card builders
- status and busy controls
- diagnostics rendering
- detached popup target handling

## Proposed Files

Create:

- `src/entrypoints/popup/app/state.ts`
- `src/entrypoints/popup/app/persistence.ts`
- `src/entrypoints/popup/app/router.ts`
- `src/entrypoints/popup/app/events.ts`
- `src/entrypoints/popup/app/render.ts`
- `src/entrypoints/popup/ui/dom.ts`
- `src/entrypoints/popup/ui/components.ts`
- `src/entrypoints/popup/ui/status.ts`
- `src/entrypoints/popup/workspaces/form-leads/render.ts`
- `src/entrypoints/popup/workspaces/form-edit-lead/render.ts`
- `src/entrypoints/popup/workspaces/call-leads/render.ts`
- `src/entrypoints/popup/workspaces/diagnostics/render.ts`
- `src/entrypoints/popup/workspaces/debug/render.ts`

Update:

- `src/entrypoints/popup/main.ts`

## Migration Strategy

Move in layers:

1. DOM refs and shared UI helpers.
2. Status/busy helpers.
3. Persistence.
4. Workspace routing.
5. Event wiring.
6. Workspace render functions.
7. Final bootstrap cleanup.

Avoid moving all render functions in one diff if possible.

## Target `main.ts`

After this unit, `main.ts` should read like:

```ts
async function init() {
  const dom = getPopupDom();
  const state = createInitialState();
  await loadPersistedState(state);

  const app = createPopupApp({
    dom,
    state,
    workflows,
    api,
  });

  attachEventHandlers(app);
  renderAll(app);
}
```

The exact shape can differ, but the key outcome is that `main.ts` no longer contains the implementation details of every workspace.

## State Rules

- Keep one owner for mutable popup state.
- Render modules should receive state and callbacks; they should not import global mutable state directly if avoidable.
- Persistence should serialize only stable preferences, not transient DOM state.
- Keep cycle history and auto-sync settings shaped for later storage migration.

## Event Rules

- Event handlers should call workflow functions and then update state/render.
- Avoid binding duplicate handlers after re-render.
- Keep event delegation for dynamic row controls where it already exists.
- Do not change button ids or data attributes unless required.

## Rendering Rules

- Preserve existing HTML structure and class names where practical.
- Extract reusable chips, field blocks, accordions, and log table builders into `ui/components.ts`.
- Keep workspace-specific rendering in workspace modules.
- Keep global controls in `app/render.ts`.

## Tests And Smoke Checks

Automated tests may be limited here unless render functions become pure. At minimum:

- Keep compile passing after each move.
- Smoke test every workspace manually.
- Verify event handlers still work after rendering rows.
- Verify detached popup targeting still works.
- Verify Diagnose Page still reports frame status.

## Acceptance Criteria

- `popup/main.ts` is a bootstrap/coordinator rather than a monolith.
- Workspace render code lives in workspace modules.
- Event wiring is centralized and easier to inspect.
- State and persistence are explicit modules.
- All existing workflows still work manually.

## Do Not Do In This Unit

- Do not migrate to a UI framework.
- Do not redesign the UI.
- Do not add the search workspace yet unless it is done as a separate feature unit after this refactor.
- Do not move background automation into `background.ts` yet.

