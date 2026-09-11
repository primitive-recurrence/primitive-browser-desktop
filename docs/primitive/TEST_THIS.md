# Primitive Browser v0.1 — execution handoff

Branch: `primitive/browser-shell-v0.1`
Base: Zen `dev`
Scope: browser fork only. `primitive-workspace` is intentionally untouched.

## What this branch should do

The browser should still behave as Zen/Firefox first. Primitive adds a browser-native product shell rather than replacing core navigation.

Expected additions:

- Primitive toolbar button in the normal browser toolbar.
- Right-side Primitive workspace panel.
- Global Primitive command center.
- Local page/resource notebook.
- Context-menu capture for page/link/selection.
- Staged contextual AI prompts with an explicit `runtime not connected` state.
- Deployment target UX with a clear adapter boundary for Coolify/Vercel/self-hosted targets.
- Workflow draft UX inspired by trigger/action automation tools.
- Lightweight spatial canvas with persistent draggable nodes.
- Browser-safe Primitive console.
- Shared shadcn-compatible OKLCH light/dark tokens applied to the Primitive shell and lightly translated into Zen chrome.

No Workspace API, model runtime, shell execution or deployment execution is claimed in this branch.

## Build / run

Use Zen's existing Surfer workflow. From the repository root:

```bash
npm install
npm run init
npm run build
npm run start
```

`npm run init` already performs download → import → bootstrap according to the repository scripts. On an already initialized checkout, the shorter cycle should be:

```bash
npm run import
npm run build
npm run start
```

Useful project-native gates:

```bash
npm run lc
npm run lint
npm test
```

If a clean import is required after changing patches/upstream state:

```bash
npm run reset-ff
npm run init
npm run build
npm run start
```

## Test this first — boot gate

1. Browser builds without `jar.mn`, preprocessing, module import or CSS errors.
2. Browser window opens normally and ordinary Zen navigation still works.
3. Browser console contains `[Primitive] Browser shell initialized` once per browser window.
4. A Primitive toolbar button appears with the square P mark.
5. No errors loop in Browser Console when opening/closing tabs.

If this gate fails, inspect these files first:

- `src/browser/base/content/zen-assets.jar.inc.mn`
- `src/browser/base/content/zen-assets.inc.xhtml`
- `src/zen/common/ZenPreloadedScripts.js`
- `src/zen/primitive/jar.inc.mn`
- `src/zen/primitive/PrimitiveShell.mjs`

## Test this — shell UX

1. Click the Primitive toolbar button.
2. Right panel opens without shifting or breaking page layout.
3. Panel header shows the active website host.
4. Switch through Home / Ask / Notes / Deploy / Flows / Canvas / Console.
5. Close and reopen the browser window: last panel open/closed state and last selected Primitive surface should persist.
6. Resize narrow and wide. At narrow widths the panel should become nearly full width and nav labels collapse.
7. Verify light and dark OS/browser appearances are legible.
8. Verify keyboard focus is visible on buttons, fields, command results and canvas nodes.
9. Turn on reduced motion and confirm Primitive animations disappear.

## Test this — keyboard

- `Ctrl+Shift+Space` (or `Cmd+Shift+Space` on macOS): toggle Primitive command center.
- `Ctrl+Shift+.` (or `Cmd+Shift+.`): toggle Primitive panel.
- Command center: type to filter, Up/Down to select, Enter to run, Escape to close.
- Existing Firefox/Zen shortcuts such as Ctrl/Cmd+L and Ctrl/Cmd+T must remain normal.

If either Primitive shortcut conflicts with an upstream/OS binding, change only the central `onKeydown` mapping in `PrimitiveShell.mjs`; do not fork Zen keyboard infrastructure yet.

## Test this — notebook and capture

1. Open a normal webpage.
2. Primitive → Notes → `Save current page`.
3. Confirm the page appears and `Open` reopens it in a tab.
4. Write a note and save it.
5. Reload/restart the browser and confirm both persist.
6. Select text on a webpage, right-click, open the `Primitive` submenu.
7. Confirm `Save selection to Notes` stores the selected text.
8. Right-click a link and confirm `Save link to Notes` appears.
9. `Ask Primitive about selection` should open Ask and prefill the selected text as context.
10. It must not fabricate an answer; `Stage prompt` should mark the request as waiting for runtime wiring.

Firefox context-menu selection field names occasionally change upstream. If selection capture is empty while the menu is otherwise visible, inspect `window.gContextMenu.selectionInfo` in Browser Toolbox and update only `contextSelection()` in `PrimitiveCapture.mjs`.

## Test this — command center

1. Open command center.
2. Run `Save current page`.
3. Run `Open Notes`.
4. Run `Open Deployments`.
5. Type a literal domain such as `example.com`; if no command matches, Enter should navigate there.
6. Run Downloads, Settings and Extensions commands and confirm native Firefox surfaces open.

## Test this — deployment UX

1. Open Deploy.
2. Add a target such as:
   - Name: `Primitive staging`
   - Provider: `Coolify`
   - Endpoint: a placeholder or actual control-plane URL
   - Project: `browser-preview`
3. Confirm the target persists across panel/browser restarts.
4. Confirm it is labelled `draft`; there must be no implication that a deployment occurred.
5. Remove the target.

This is the browser-side UX seam only. Future adapters should replace the local target record with typed provider state rather than embedding Coolify logic in browser chrome.

## Test this — workflows

1. Create a workflow draft with trigger and action text.
2. Toggle `Arm locally` / `Disarm`.
3. Confirm state persists.
4. Confirm no external action fires.

The intended future mapping is browser event → Primitive runtime/Activepieces/n8n-style adapter → auditable action. Browser chrome should never become the workflow execution engine.

## Test this — canvas

1. Add current page.
2. Add several ideas.
3. Drag nodes.
4. Switch surfaces and return: positions should persist.
5. Double-click a web node: its URL should open.
6. Clear canvas.

The v0.1 renderer is intentionally lightweight. When Workspace wiring begins, replace rendering with the existing React Flow capability while retaining the browser interaction contract.

## Test this — console

Run:

```text
help
url
save
new
open example.com
panel notes
clear
```

Unknown commands must be rejected as browser commands and must never be forwarded to an operating-system shell.

## UX review questions

While reviewing the build, answer these rather than judging individual colors in isolation:

1. Does Primitive feel like part of the browser or like a website bolted onto it?
2. Is the right panel the correct default interaction surface, or should certain modes become split/full tabs?
3. Should Zen workspaces map visually to Primitive projects/contexts, or remain browser-only groups?
4. Is the command center faster than navigating the panel for common actions?
5. Which surfaces deserve persistent left/right docking?
6. Does the browser need a dedicated Primitive home/new-tab experience after this shell is validated?
7. Should Deploy / Flows / Canvas live directly in browser chrome or open richer internal tabs after selection?

## Known intentional boundaries

- `primitive-workspace`: untouched.
- AI: prompt/context UX only; no model execution.
- Terminal: browser-safe command interpreter only; no OS shell.
- Deploy: target management only; no API requests.
- Workflows: local drafts only; no automation execution.
- Canvas: local DOM renderer; no React Flow dependency in browser chrome.
- Page capture: page/link/selection metadata and text; no full DOM snapshot/readability pipeline yet.
- Sync: Firefox prefs in the local profile only.

## Files added

```text
src/zen/primitive/
├── PrimitiveShell.mjs
├── PrimitiveCapture.mjs
├── jar.inc.mn
├── assets/
│   └── primitive-mark.svg
└── styles/
    ├── primitive-theme.css
    └── primitive-shell.css
```

## Existing Zen files intentionally touched

```text
src/browser/base/content/zen-assets.jar.inc.mn
src/browser/base/content/zen-assets.inc.xhtml
src/zen/common/ZenPreloadedScripts.js
```

Those three files are the only upstream integration seams for this slice. Keep that property if repairing the build.
