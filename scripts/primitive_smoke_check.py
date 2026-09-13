#!/usr/bin/env python3
"""Cheap static integration preflight for Primitive Browser.

This does not compile or launch Firefox. It catches missing files, missing Zen
package/startup hooks, unsafe prototype metadata and accidental runtime wiring
before the expensive Surfer/Firefox build begins.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MODULES = [
    "PrimitiveShell.mjs",
    "PrimitiveCapture.mjs",
    "PrimitiveExperience.mjs",
    "PrimitiveNavigation.mjs",
    "PrimitiveSplit.mjs",
    "PrimitiveSpaces.mjs",
    "PrimitiveToolbar.mjs",
    "PrimitiveContext.mjs",
]
STYLES = [
    "primitive-theme.css",
    "primitive-shell.css",
    "primitive-experience.css",
]
OTHER_FILES = [
    "src/zen/primitive/jar.inc.mn",
    "src/zen/primitive/assets/primitive-mark.svg",
    "docs/primitive/TEST_THIS.md",
    "docs/primitive/UPSTREAMS.md",
]

ERRORS: list[str] = []
WARNINGS: list[str] = []


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.exists():
        ERRORS.append(f"missing: {relative}")
        return ""
    return path.read_text(encoding="utf-8")


def require(haystack: str, needle: str, context: str) -> None:
    if needle not in haystack:
        ERRORS.append(f"{context}: expected {needle!r}")


def forbid(haystack: str, needle: str, context: str) -> None:
    if needle in haystack:
        ERRORS.append(f"{context}: forbidden {needle!r}")


expected_files = [
    *[f"src/zen/primitive/{name}" for name in MODULES],
    *[f"src/zen/primitive/styles/{name}" for name in STYLES],
    *OTHER_FILES,
]
for relative in expected_files:
    if not (ROOT / relative).exists():
        ERRORS.append(f"missing: {relative}")

zen_jar = read("src/browser/base/content/zen-assets.jar.inc.mn")
require(
    zen_jar,
    "#include ../../../zen/primitive/jar.inc.mn",
    "Zen jar integration",
)

assets = read("src/browser/base/content/zen-assets.inc.xhtml")
for stylesheet in STYLES:
    require(
        assets,
        f"primitive/styles/{stylesheet}",
        "browser chrome stylesheet integration",
    )

preloaded = read("src/zen/common/ZenPreloadedScripts.js")
primitive_jar = read("src/zen/primitive/jar.inc.mn")
for module in MODULES:
    require(preloaded, module, "browser startup integration")
    require(primitive_jar, module, "Primitive package manifest")
for stylesheet in STYLES:
    require(primitive_jar, stylesheet, "Primitive package manifest")
require(primitive_jar, "primitive-mark.svg", "Primitive package manifest")

surfer_path = ROOT / "surfer.json"
if surfer_path.exists():
    try:
        surfer = json.loads(surfer_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        ERRORS.append(f"surfer.json: invalid JSON: {exc}")
        surfer = {}

    if surfer.get("name") != "Primitive Browser":
        ERRORS.append("surfer.json: product name is not Primitive Browser")
    if surfer.get("vendor") != "Primitive Labs":
        ERRORS.append("surfer.json: vendor is not Primitive Labs")
    if surfer.get("updateHostname") == "updates.zen-browser.app":
        ERRORS.append("surfer.json: prototype still points at Zen update service")
    if surfer.get("updateHostname") != "updates.primitive.invalid":
        WARNINGS.append(
            "surfer.json: update host is not the intentionally inert prototype hostname"
        )
else:
    ERRORS.append("missing: surfer.json")

shell = read("src/zen/primitive/PrimitiveShell.mjs")
require(shell, "window.gPrimitiveShell", "Primitive shell public seam")
require(shell, "primitive.browser.shell.", "Primitive local state prefix")
require(shell, "runtime not connected", "honest AI/runtime state")

capture = read("src/zen/primitive/PrimitiveCapture.mjs")
require(capture, "contentAreaContextMenu", "context capture")
require(capture, "Save selection to Notes", "context capture")

experience = read("src/zen/primitive/PrimitiveExperience.mjs")
require(
    experience,
    'SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs"',
    "default search integration",
)
require(experience, "lazy.SearchService.getDefault", "default search integration")
forbid(experience, "Services.search", "default search integration")
require(experience, "panelDocked", "dock persistence")
require(experience, "panelWidth", "resize persistence")

navigation = read("src/zen/primitive/PrimitiveNavigation.mjs")
require(navigation, "Save window as tab set", "navigation UX")
require(navigation, "primitive-browser-local-state", "portable state")

split = read("src/zen/primitive/PrimitiveSplit.mjs")
require(split, "gZenViewSplitter", "Zen split reuse")
require(split, "splitTabs", "Zen split reuse")

spaces = read("src/zen/primitive/PrimitiveSpaces.mjs")
require(spaces, "gZenWorkspaces", "Zen workspace reuse")
require(spaces, "moveTabToWorkspace", "Zen workspace reuse")

toolbar = read("src/zen/primitive/PrimitiveToolbar.mjs")
require(toolbar, "CustomizableUI", "native Firefox toolbar integration")
require(toolbar, "createWidget", "native Firefox toolbar integration")

context = read("src/zen/primitive/PrimitiveContext.mjs")
require(context, "zen-workspace-id", "active browser context")
require(context, "containerId", "active browser context")
require(context, "splitView", "active browser context")

all_primitive_source = "\n".join(
    read(f"src/zen/primitive/{module}") for module in MODULES
)
for forbidden_value in (
    "primitive-workspace",
    "api.openai.com",
    "api.anthropic.com",
    "coolify.io/api",
    "localhost:3000/api",
    "child_process",
    "exec(",
    "spawn(",
):
    forbid(all_primitive_source, forbidden_value, "browser-only boundary")

print("Primitive Browser static preflight")
print(f"  root: {ROOT}")
print(f"  browser modules: {len(MODULES)}")
print(f"  chrome stylesheets: {len(STYLES)}")
print(f"  expected files: {len(expected_files)}")

if WARNINGS:
    print("\nWarnings:")
    for warning in WARNINGS:
        print(f"  - {warning}")

if ERRORS:
    print("\nFAILED:")
    for error in ERRORS:
        print(f"  - {error}")
    sys.exit(1)

print("\nPASS: browser-side integration seams are internally consistent.")
print("Next gates: npm run test:primitive:syntax, npm run lc, npm run lint, npm run build, npm run start")
