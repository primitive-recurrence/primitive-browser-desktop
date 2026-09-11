# Primitive Browser — upstream / donor register

This file records the browser-side reuse boundary for `primitive/browser-shell-v0.1`.

The rule for this branch is simple: **Primitive-owned implementation lives under `src/zen/primitive`; external projects inform interaction patterns unless a specific file is deliberately imported and attributed.** No source file from the projects below has been copied into this branch in v0.1.

| Fork / upstream | Role in browser work | License status checked for this pass | v0.1 treatment |
| --- | --- | --- | --- |
| `primitive-browser-desktop` / Zen | Firefox browser runtime, workspaces, vertical tabs, split browsing, chrome | MPL-2.0 | Base / modified through normal Zen overlay seams |
| `anythingllm-extension` | Browser → AI capture interaction reference | MIT | Interaction reference; PrimitiveCapture is new code |
| `coolify` | Deployment/environment control-plane UX reference | Apache-2.0 | Interaction reference; Deploy surface is new code |
| `activepieces` | Trigger → action workflow UX reference | MIT for non-EE areas; explicit EE exclusions | Interaction reference only |
| `AppFlowy` | Notebook/document/library UX reference | AGPL-3.0 | Reference only; no code copied |
| `tiptap` | Future rich-document editor | Verify relevant package/file before import | Not imported into browser chrome |
| `ai-elements` | Future AI conversation / tool-call presentation | Verify relevant package/file before import | Reference only in v0.1 |
| `penpot` | Canvas/design interaction reference | Verify relevant package/file before import | Reference only in v0.1 |
| `memgraph` | Graph interaction / graph-data reference | Verify relevant component before import | Reference only in v0.1 |
| `evidence` | Data/report presentation reference | Verify relevant package/file before import | Reference only in v0.1 |
| `hyper-terminal` | Terminal interaction reference | Verify relevant package/file before import | Reference only; v0.1 console is new browser-safe code |
| `pocketbase` | Possible future local service/data boundary | Verify before adoption | Not imported |

## Verified license notes from the user's forks

### AnythingLLM Browser Extension

The fork's root `LICENSE` is the MIT License and retains Mintplex Labs Inc. copyright. If code is copied later, preserve the required notice.

### Coolify

The fork's root `LICENSE` is Apache License 2.0. v0.1 does not copy Coolify implementation; its deployment surface borrows only the control-plane concept of named environments/targets with explicit status.

### Activepieces

The root license states that content outside designated enterprise directories is MIT Expat, while enterprise paths have a separate license. v0.1 copies none of it. Any later implementation import must explicitly reject enterprise paths unless separately reviewed.

### AppFlowy

The root license is AGPL-3.0. Treat AppFlowy as a UX/reference body for this product unless a deliberate licensing decision is made. Do not casually copy AppFlowy code into Primitive Browser.

## Product-boundary decisions

The following are intentionally **not** browser responsibilities:

- model/provider orchestration;
- RAG/vector retrieval;
- Primitive Core reasoning;
- deployment execution;
- workflow execution;
- operating-system command execution;
- graph database operation;
- rich document persistence across the Primitive estate.

The browser owns the interaction surface, active-page context, local prototype state, navigation and capture events. Those events will later cross a typed bridge into Primitive Workspace/services.

## When importing donor code later

For every copied/adapted file, add a record before merge:

```text
Source repository:
Source commit:
Source file:
Destination file:
License:
Copyright notice retained:
Modification summary:
Runtime/distribution status:
```

Prefer adapting APIs and interaction concepts over vendoring entire applications. The browser must remain maintainable against upstream Zen/Firefox updates.
