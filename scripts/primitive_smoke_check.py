#!/usr/bin/env python3
"""Static preflight for Primitive Browser.

This intentionally does not pretend to compile or launch Firefox. It catches
cheap integration mistakes before the expensive Surfer/Firefox build starts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PRIMITIVE_FILES = [
    "src/zen/primitive/jar.inc.mn",
    "src/zen/primitive/PrimitiveShell.mjs",
    "src/zen/primitive/PrimitiveCapture.mjs",
    "src/zen/primitive/PrimitiveExperience.mjs",
    "src/zen/primitive/PrimitiveNavigation.mjs",
    "src/zen/primitive/PrimitiveSplit.mjs",
    "src/zen/primitive/styles/primitive-theme.css",
    "src/zen/primitive/styles/primitive-shell.css",
    "src/zen/primitive/styles/primitive-experience.css",
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


for relative in PRIMITIVE_FILES:
    if not (ROOT / relative).exists():
        ERRORS.append(f"missing: {relative}")

jar = read("src/browser/base/content/zen-assets.jar.inc.mn")
require(jar, "#include ../../../zen/primitive/jar.inc.mn", "Zen jar integration")

assets = read("src/browser/base/content/zen-assets.inc.xhtml")
for stylesheet in (
    "primitive/styles/primitive-theme.css",
    "primitive/styles/primitive-shell.css",
    "primitive/styles/primitive-experience.css",
):
    require(assets, stylesheet, "browser chrome stylesheet integration")

preloaded = read("src/zen/common/ZenPreloadedScripts.js")
for module in (
    "PrimitiveShell.mjs",
    "PrimitiveCapture.mjs",
    "PrimitiveExperience.mjs",
    "PrimitiveNavigation.mjs",
    "PrimitiveSplit.mjs",
):
    require(preloaded, module, "browser startup integration")

primitive_jar = read("src/zen/primitive/jar.inc.mn")
for package_name in (
    "PrimitiveShell.mjs",
    "PrimitiveCapture.mjs",
    "PrimitiveExperience.mjs",
    "PrimitiveNavigation.mjs",
    "PrimitiveSplit.mjs",
    "primitive-theme.css",
    "primitive-shell.css",
    "primitive-experience.css",
    "primitive-mark.svg",
):
    require(primitive_jar, package_name, "Primitive package manifest")

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
forbid(shell, "primitive-workspace", "browser/workspace isolation")
forbid(shell, "child_process", "browser shell safety")
forbid(shell, "exec(", "browser shell safety")
forbid(shell, "spawn(", "browser shell safety")

capture = read("src/zen/primitive/PrimitiveCapture.mjs")
require(capture, "contentAreaContextMenu", "context capture")
require(capture, "Save selection to Notes", "context capture")

experience = read("src/zen/primitive/PrimitiveExperience.mjs")
require(experience, "Services.search.getDefault", "default search integration")
require(experience, "panelDocked", "dock persistence")
require(experience, "panelWidth", "resize persistence")

navigation = read("src/zen/primitive/PrimitiveNavigation.mjs")
require(navigation, "Save window as tab set", "navigation UX")
require(navigation, "primitive-browser-local-state", "portable state")

split = read("src/zen/primitive/PrimitiveSplit.mjs")
require(split, "gZenViewSplitter", "Zen split reuse")
require(split, "splitTabs", "Zen split reuse")

all_primitive_source = "\n".join(
    read(relative)
    for relative in PRIMITIVE_FILES
    if relative.startswith("src/zen/primitive/") and not relative.endswith(".svg")
)
for forbidden in (
    "api.openai.com",
    "api.anthropic.com",
    "coolify.io/api",
    "localhost:3000/api",
):
    forbid(all_primitive_source, forbidden, "browser-only boundary")

print("Primitive Browser static preflight")
print(f"  root: {ROOT}")
print(f"  expected Primitive files: {len(PRIMITIVE_FILES)}")

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
print("Next gates: npm run lc, npm run lint, npm run build, npm run start")
