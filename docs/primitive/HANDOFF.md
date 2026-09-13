# Primitive Browser v0.1 — code handoff

Branch: `primitive/browser-shell-v0.1`
Base: Zen `dev` at `0a548c7572dd94afdc0240daaaabc4af5da5a99c`
Product layer: Zen / Firefox 155.0.1 browser fork only
Workspace status: **`primitive-workspace` was not modified or imported**

## What has been implemented

This branch converts the Zen fork from a renamed browser into the first Primitive-native browser experience while deliberately keeping Zen/Firefox responsible for rendering, tabs, workspaces, split views, security and standard browser behavior.

### Browser chrome

- Primitive Browser / Primitive Labs generated product branding.
- Prototype update channel isolated from Zen (`updates.primitive.invalid`) so a Primitive development install cannot mistake Zen releases for Primitive updates.
- User-provided shadcn OKLCH light/dark token set applied as the Primitive visual source of truth.
- Quiet translation of those tokens into Zen URL bar, tab, sidebar and focus chrome.
- Native Firefox `CustomizableUI` toolbar widget with a Primitive mark.
- Floating right-side Primitive work panel.
- Optional docked mode that reserves a work column beside the page.
- Pointer and keyboard-resizable panel with persistent width.
- Reduced-motion behavior and narrow-window fallback.

### Command/navigation layer

Global shortcut:

```text
Ctrl/Cmd + Shift + Space
```

opens the Primitive command center.

The command center currently supports:

- focus Firefox address bar;
- new tab;
- default-engine web search for arbitrary text;
- direct URL navigation;
- live open-tab switching;
- saved-resource reopening;
- save/restore whole-window tab sets;
- switch Zen workspace;
- previous/next Zen workspace;
- move current tab to another Zen workspace;
- create native Zen empty split;
- split current page with any other open tab using `gZenViewSplitter`;
- pin/unpin current tab;
- open Downloads / Settings / Extensions;
- open Primitive surfaces;
- copy current page context JSON;
- copy full local Primitive prototype state JSON.

Primitive does not implement a second tab, workspace or split-view engine.

### Active browser context

Primitive page context now includes:

```text
title
url
host
workspace.id
workspace.name
workspace.icon
tab.pinned
tab.split
tab.containerId
tab.private
```

The panel displays compact badges for useful native context such as workspace, Pinned, Split, Container and Private.

### Page capture / research interaction

A browser-native `Primitive` context submenu is added to the Firefox page context menu.

Depending on context it provides:

- Ask Primitive about selection / current page;
- Save selection to Notes;
- Save current page to Notes;
- Save link to Notes;
- Add current page to Canvas;
- Open Primitive panel.

Selection interaction is modelled after the useful browser→AI capture pattern found in the AnythingLLM extension, but the v0.1 implementation is new browser-native code rather than a copied extension.

### Primitive panel surfaces

#### Home

Current web context, high-frequency actions and clear runtime status.

#### Ask

A contextual prompt composer. Prompts are persisted as `awaiting-runtime` requests. **It does not fabricate an AI response.** This is the future handoff seam to Primitive Workspace/Router.

#### Notes

Browser-local page captures and lightweight notes. Saved pages can be reopened. This proves the notebook/research flow before Tiptap or Workspace storage is introduced.

#### Deploy

Local deployment target drafts with:

```text
name
provider
endpoint
project/service
status=draft
```

The interaction is deliberately informed by Coolify-style control planes, but no token is stored and no deployment API is called from browser chrome.

#### Flows

Local trigger → action automation drafts inspired by Activepieces/n8n-style workflows. `Arm locally` persists intent only; no external action executes.

#### Canvas

Lightweight dotted spatial canvas with:

- current-page nodes;
- idea nodes;
- drag repositioning;
- persistent coordinates;
- double-click web node to reopen;
- clear canvas.

This intentionally proves the browser-side spatial interaction before the renderer is replaced by the existing React Flow system during Workspace wiring.

#### Console

A browser-safe Primitive command interpreter:

```text
help
url
save
new
open <url or query>
panel <surface>
clear
```

Unknown commands are rejected. There is no OS shell execution path.

## Browser-local state contract

Temporary state lives in Firefox preferences under:

```text
primitive.browser.shell.*
```

Current records:

```text
panelOpen           boolean
panelDocked         boolean
panelWidth          integer
mode                string
pages               JSON array
notes               JSON array
prompts             JSON array
deploymentTargets   JSON array
flows               JSON array
canvasNodes         JSON array
tabSets             JSON array
```

This is explicitly prototype persistence. Do not teach Workspace to read Firefox prefs. At integration time, replace the store methods behind the browser contract with the typed browser↔Workspace bridge.

## Portable handoff format

Command center → **Copy Primitive state snapshot** creates JSON shaped as:

```json
{
  "schema": "primitive-browser-local-state",
  "version": 1,
  "exportedAt": "...",
  "source": {
    "product": "Primitive Browser",
    "layer": "zen-firefox-prototype"
  },
  "activeContext": {},
  "openTabs": [],
  "state": {
    "pages": [],
    "notes": [],
    "prompts": [],
    "deploymentTargets": [],
    "flows": [],
    "canvasNodes": [],
    "tabSets": []
  }
}
```

This is deliberately easy to transform later into canonical Primitive Resources, Sources, Projects and actions.

## Source layout

```text
src/zen/primitive/
├── PrimitiveShell.mjs        core shell + panel surfaces + local store
├── PrimitiveCapture.mjs      page/link/selection context-menu capture
├── PrimitiveExperience.mjs   search + floating/docked/resizable layout
├── PrimitiveNavigation.mjs   open tabs, tab sets, resource nav, JSON export
├── PrimitiveSplit.mjs        Zen native split-view commands
├── PrimitiveSpaces.mjs       Zen native workspace switching/tab movement
├── PrimitiveToolbar.mjs      Firefox CustomizableUI toolbar registration
├── PrimitiveContext.mjs      active workspace/tab/container/private context
├── jar.inc.mn
├── assets/
│   └── primitive-mark.svg
└── styles/
    ├── primitive-theme.css
    ├── primitive-shell.css
    └── primitive-experience.css
```

Only these upstream integration/config seams are intentionally changed:

```text
src/browser/base/content/zen-assets.jar.inc.mn
src/browser/base/content/zen-assets.inc.xhtml
src/zen/common/ZenPreloadedScripts.js
surfer.json
package.json
.github/workflows/primitive-browser-preflight.yml
```

## First commands for Work

Do the cheap gates before downloading/building Firefox:

```bash
git fetch origin
git checkout primitive/browser-shell-v0.1
git pull

npm run test:primitive
npm run test:primitive:syntax
```

Then license/style gates:

```bash
npm run lc
```

Some earliest-created Primitive files were added before the header convention was normalized. If the license checker reports only missing MPL headers in `src/zen/primitive`, run:

```bash
npm run lc:fix
git diff -- src/zen/primitive
npm run lc
```

Review the diff rather than blindly committing unrelated license changes.

For a clean checkout:

```bash
npm install
npm run init
npm run build
npm run start
```

On a checkout where Zen/Firefox has already been initialized:

```bash
npm install
npm run import
npm run build
npm run start
```

Then:

```bash
npm run lint
npm test
```

## Visual/interaction acceptance sequence

Run this exact sequence before changing the UX:

1. Launch browser; normal Zen/Firefox navigation must work before opening Primitive.
2. Confirm title/branding reads Primitive Browser where generated branding applies.
3. Confirm the Primitive toolbar item is present or available through toolbar Customize.
4. Click it; panel floats over the right side.
5. Resize panel by dragging its left edge, then restart browser and confirm width persists.
6. Click the dock icon; web content should resize rather than sit behind the panel. Undock again.
7. Open command center with `Ctrl/Cmd+Shift+Space`.
8. Search for an existing open tab by title and switch to it.
9. Type ordinary search words that are not a URL; they should use Firefox's configured default search engine.
10. Type a URL/domain; it should navigate directly.
11. Create at least two Zen workspaces. Reopen command center and verify both appear under Switch workspace.
12. Move the current tab between those workspaces from Primitive.
13. Open two tabs, command center → Split with open tab; confirm Zen native split view activates.
14. Save a whole window as a tab set, close/rearrange some tabs, then Restore latest tab set.
15. Save a page to Notes. Restart browser and verify it persists.
16. Select text on a webpage → right-click → Primitive → Save selection to Notes.
17. Select text → Ask Primitive about selection. Ask should open with the selection prefilled.
18. Stage the prompt. It must show `not wired` / runtime-disconnected state and never invent output.
19. Add current page to Canvas, drag it, leave the surface and return; coordinates should persist.
20. Add a Coolify-labelled deployment target; confirm it remains `draft` and no network action occurs.
21. Create and arm a Flow; confirm no external action occurs.
22. Copy page-context JSON and full Primitive-state JSON; paste both into an editor and inspect.
23. Open toolbar Customize and move/remove/re-add Primitive. It should behave like a native widget.
24. Test light, dark, narrow window and reduced-motion modes.
25. Open Browser Console and inspect for recurring `[Primitive]` exceptions while changing tabs/workspaces.

## Most likely first-run repair points

These are the integration assumptions worth checking first if Firefox 155 rejects something.

### 1. CustomizableUI module path

File:

```text
src/zen/primitive/PrimitiveToolbar.mjs
```

Expected module:

```text
resource:///modules/CustomizableUI.sys.mjs
```

If Firefox 155 exposes it only as an existing browser global, replace the import helper with that global. Do not go back to a permanently hand-appended toolbar button.

### 2. Context-menu selection field

File:

```text
src/zen/primitive/PrimitiveCapture.mjs
```

Current fallbacks:

```text
gContextMenu.selectionInfo.text
gContextMenu.selectionInfo.fullText
gContextMenu.textSelected
```

If selection is blank, inspect `gContextMenu.selectionInfo` in Browser Toolbox and fix `contextSelection()` only.

### 3. Dock content selector

File:

```text
src/zen/primitive/styles/primitive-experience.css
```

Current dock reservation targets:

```text
#zen-appcontent-wrapper
```

If a particular Zen toolbar mode makes the content jump, repair only the docked selector/layout. Floating mode should remain unaffected.

### 4. Workspace tab movement

File:

```text
src/zen/primitive/PrimitiveSpaces.mjs
```

Current API:

```text
gZenWorkspaces.moveTabToWorkspace(tab, workspace.uuid)
```

If Firefox/Zen requires a follow-up selection or visibility update, use the existing Zen manager method rather than manipulating workspace attributes directly.

### 5. Split result return value

File:

```text
src/zen/primitive/PrimitiveSplit.mjs
```

The source-confirmed API is:

```text
gZenViewSplitter.splitTabs([current, other], undefined, 0)
```

If `splitTabs()` succeeds but returns `undefined`, judge success from the resulting tab `splitView` state; do not replace Zen's split engine.

## CI

A fast workflow exists at:

```text
.github/workflows/primitive-browser-preflight.yml
```

It runs on Primitive branch/PR changes and checks:

- file/package/startup consistency;
- prototype update-host isolation;
- browser-only/runtime boundaries;
- JavaScript syntax with Node 24.

It deliberately does **not** claim Firefox build or runtime acceptance.

## External fork strategy after the UX review

Do not merge entire applications into browser chrome.

After this v0.1 user-flow review, use the forks like this:

- **AnythingLLM extension:** continue borrowing browser capture/document-ingestion patterns where useful; MIT attribution if source is actually copied.
- **Tiptap:** rich internal Document/Notebook surface, not browser toolbar chrome.
- **AI Elements:** production AI message/tool/reasoning presentation once Primitive runtime is wired.
- **Coolify:** provider adapter/service for deployment status/actions; browser surface remains the control view.
- **Activepieces:** workflow/action adapter and catalog; avoid designated enterprise-only paths unless separately licensed.
- **Penpot:** design/canvas interaction reference and possible interoperable design service, not a copied browser renderer.
- **AppFlowy:** UX/reference only under the current licensing decision; no casual AGPL code import.
- **PocketBase/Memgraph/Evidence:** evaluate behind service boundaries when their capability is actually needed.
- **Hyper:** terminal UX/reference; any real terminal must run through an explicitly permissioned external runtime, never privileged browser chrome.

## Definition of done for this pass

This code pass is ready for Work when:

- cheap CI/preflight is green;
- Work can import/build/start the fork;
- normal browsing is not regressed;
- Primitive toolbar + panel + command center operate;
- Zen workspaces/splits work through Primitive;
- local notes/capture/tab sets/canvas/deploy/flows persist;
- AI/deployment/workflow/OS actions remain explicitly disconnected;
- the UX can be reviewed end-to-end without `primitive-workspace`.

After that review, the correct next engineering task is not more browser chrome. It is replacing the local prototype store and staged actions with a typed browser bridge into the existing Primitive Workspace runtime.


## Active Work checkpoint — 2026-09-13 12:33 UTC

This checkpoint is intentionally operational so another Work account can resume without re-auditing the repository.

- Release PR: [#1](https://github.com/primitive-recurrence/primitive-browser-desktop/pull/1)
- Working branch at diagnosis: `primitive/browser-shell-v0.1`
- Starting head: `6787fcd9fa27a00d4f3ba8ea83a76dbdb6418b9f`
- Static preflight run `34756447338`: **green**
- Native full-build run `34756447318`: **still compiling** at this checkpoint. Its checkout/import/bootstrap/static steps are green. Do not classify it as failed unless the completed run or compiler log proves that.
- Lint run `34756447339`: failed at the source-sync step, not at checkout/import/bootstrap.
- Confirmed lint causes:
  1. `replace(..., new="")` in `primitive_semantic_lint_fix.py` returned early because the empty string is contained in every string, so the known `console.info` removal was skipped.
  2. After Surfer import, `engine/zen/primitive/*.mjs` and `src/zen/primitive/*.mjs` resolve to the same files, so the explicit `cp` sync step exited with “are the same file”.
- The commit containing this checkpoint fixes both mechanical faults. The lint workflow still applies Mozilla autofixes, runs the real `mach lint -f unix zen/primitive` gate, verifies smoke/diff, and commits normalized Primitive source to the PR branch.
- Resume rule: inspect the newest PR head and workflow runs first. If lint has pushed a normalization commit, review that exact diff, confirm lint green, then continue with the full native build gate. Do not repeat the estate audit or reopen Browser/Workspace/Harness architecture.

### Follow-up diagnosis and prepared source fix

Local verification exposed one additional contract issue before CI could commit its autofix: removing `Services.search` entirely made the Browser smoke gate fail because v0.1 promises native default-engine search when available. Firefox 155's supported pattern is already used in this fork's `src/zen/welcome/ZenWelcome.mjs`:

```js
ChromeUtils.defineESModuleGetters(lazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});
```

`PrimitiveExperience.mjs` now uses `lazy.SearchService.getDefault()`, preserves URL opening and the honest address-bar fallback, and never hardcodes an external search engine. The smoke check asserts the supported module seam and explicitly forbids `Services.search`.

Verified locally after applying semantic normalization twice:

- `python3 scripts/primitive_semantic_lint_fix.py` twice: **green / idempotent**
- `git diff --check`: **green**
- `npm run test:primitive`: **green**
- `npm run test:primitive:syntax`: **green**

The next authority is the commit containing this section and its newest GitHub runs. The earlier lint run from `b3050cff` is expected to fail its smoke step because it began before this corrected SearchService patch; do not repair or rerun that obsolete run.
