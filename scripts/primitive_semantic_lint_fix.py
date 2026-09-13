#!/usr/bin/env python3
"""Apply deterministic, semantic-safe fixes before Mozilla autofix formatting.

This is deliberately narrow: it only rewrites known Primitive Browser lint
findings that Mozilla's ESLint autofixer cannot safely resolve on its own.
The script is idempotent and fails if an expected source shape disappears.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIMITIVE = ROOT / "src" / "zen" / "primitive"


def replace(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"{label}: expected source shape not found in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        if new in text:
            return
        raise RuntimeError(f"{label}: expected source shape not found in {path}")
    path.write_text(text.replace(old, new), encoding="utf-8")


# PrimitiveCapture: avoid shadowing the Window.open global.
capture = PRIMITIVE / "PrimitiveCapture.mjs"
replace(capture, '  const open = createMenuItem(\n', '  const openButton = createMenuItem(\n', "capture open variable")
replace(capture, '    open\n  );\n', '    openButton\n  );\n', "capture open append")

# PrimitiveExperience: privileged Firefox search services have changed across
# upstream versions. Keep the honest, browser-native fallback instead of using
# an invalid Services.search member, and make return behavior explicit.
experience = PRIMITIVE / "PrimitiveExperience.mjs"
replace(
    experience,
    '''    try {\n      const engine = await Services.search.getDefault();\n      const submission = engine?.getSubmission(value, null, "keyword");\n      if (submission?.uri?.spec) {\n        return openUrl(submission.uri.spec);\n      }\n    } catch (error) {\n      console.warn("[Primitive] Default search submission unavailable", error);\n    }\n\n    // Honest fallback: stage the query in Firefox's own address bar and leave\n    // execution to the user rather than constructing an unreliable search URL.\n''',
    '''    // Stage non-URL input in Firefox's own address bar and leave search\n    // execution to the browser/user rather than depending on an unstable\n    // privileged search-service API.\n''',
    "experience search service",
)
replace(
    experience,
    '''    if (window.gURLBar) {\n      window.gURLBar.value = value;\n      window.gURLBar.focus();\n      window.gURLBar.select();\n      shell.notify("Search staged in the address bar — press Enter.");\n    }\n  };\n''',
    '''    if (window.gURLBar) {\n      window.gURLBar.value = value;\n      window.gURLBar.focus();\n      window.gURLBar.select();\n      shell.notify("Search staged in the address bar — press Enter.");\n    }\n    return undefined;\n  };\n''',
    "experience consistent return",
)
replace(experience, '    for (const name of ["openPanel", "closePanel", "togglePanel"]) {\n', '    for (const methodName of ["openPanel", "closePanel", "togglePanel"]) {\n', "experience method name")
replace(experience, '      const original = this.shell[name]?.bind(this.shell);\n', '      const original = this.shell[methodName]?.bind(this.shell);\n', "experience method lookup")
replace(experience, '      this.shell[name] = (...args) => {\n', '      this.shell[methodName] = (...args) => {\n', "experience method assignment")

# PrimitiveNavigation: avoid shadowing the DOM navigation global.
navigation = PRIMITIVE / "PrimitiveNavigation.mjs"
replace(navigation, '  const navigation = new PrimitiveNavigation(shell);\n  navigation.init();\n', '  const primitiveNavigation = new PrimitiveNavigation(shell);\n  primitiveNavigation.init();\n', "navigation instance")

# PrimitiveToolbar: avoid shadowing Firefox's injected CustomizableUI global.
toolbar = PRIMITIVE / "PrimitiveToolbar.mjs"
replace(toolbar, '  const CustomizableUI = customizableUI();\n', '  const customizableUIApi = customizableUI();\n', "toolbar API variable")
replace_all(toolbar, 'if (!CustomizableUI)', 'if (!customizableUIApi)', "toolbar null check")
replace_all(toolbar, 'CustomizableUI.getWidget', 'customizableUIApi.getWidget', "toolbar getWidget")
replace_all(toolbar, 'CustomizableUI.createWidget', 'customizableUIApi.createWidget', "toolbar createWidget")
replace_all(toolbar, 'CustomizableUI.AREA_NAVBAR', 'customizableUIApi.AREA_NAVBAR', "toolbar area")

# PrimitiveShell: rename locals that collide with browser globals and remove the
# informational console call that Mozilla lint intentionally rejects.
shell = PRIMITIVE / "PrimitiveShell.mjs"
replace(shell, '    console.info("[Primitive] Browser shell initialized");\n', '', "shell console info")
replace(
    shell,
    '''  togglePanel() {\n    const open = this.panel.hidden;\n    this.panel.hidden = !open;\n    this.store.panelOpen = open;\n    if (open) {\n      this.renderSurface(this.store.mode);\n    }\n  }\n''',
    '''  togglePanel() {\n    const shouldOpen = this.panel.hidden;\n    this.panel.hidden = !shouldOpen;\n    this.store.panelOpen = shouldOpen;\n    if (shouldOpen) {\n      this.renderSurface(this.store.mode);\n    }\n  }\n''',
    "shell panel open variable",
)
replace(shell, '    const status = section("Runtime", null, null);\n', '    const runtimeSection = section("Runtime", null, null);\n', "shell runtime section")
replace_all(shell, '    status.append(', '    runtimeSection.append(', "shell runtime append")
replace(shell, '    this.panelBody.replaceChildren(head, quick, status);\n', '    this.panelBody.replaceChildren(head, quick, runtimeSection);\n', "shell runtime render")
replace(shell, '    const prompt = node("textarea", {\n', '    const promptInput = node("textarea", {\n', "shell prompt input")
replace_all(shell, 'prompt.value', 'promptInput.value', "shell prompt value")
replace_all(shell, 'prompt.focus()', 'promptInput.focus()', "shell prompt focus")
replace(shell, '    this.panelBody.replaceChildren(head, prompt, actions, stagedSection);\n', '    this.panelBody.replaceChildren(head, promptInput, actions, stagedSection);\n', "shell prompt render")
replace(shell, '        const open = button("Open", {\n', '        const openButton = button("Open", {\n', "shell page open button")
replace(shell, '            node("div", { class: "primitive-actions" }, [open, remove]),\n', '            node("div", { class: "primitive-actions" }, [openButton, remove]),\n', "shell page action buttons")
replace(shell, '    const status = node("div", { class: "primitive-runtime-card" }, [\n', '    const statusCard = node("div", { class: "primitive-runtime-card" }, [\n', "shell deploy status")
replace(shell, '    head.append(status);\n', '    head.append(statusCard);\n', "shell deploy status append")
replace(shell, '    const name = node("input", {\n      class: "primitive-field",\n      id: "primitive-deploy-name",\n', '    const targetNameInput = node("input", {\n      class: "primitive-field",\n      id: "primitive-deploy-name",\n', "shell deployment name")
replace(shell, '      node("div", { class: "primitive-form-grid" }, [name, provider, endpoint, project]),\n', '      node("div", { class: "primitive-form-grid" }, [targetNameInput, provider, endpoint, project]),\n', "shell deployment form")
replace(shell, '            const targetName = name.value.trim();\n', '            const targetName = targetNameInput.value.trim();\n', "shell deployment value")
replace(shell, '              name.focus();\n', '              targetNameInput.focus();\n', "shell deployment focus")
replace(shell, '    const name = node("input", {\n      class: "primitive-field",\n      id: "primitive-flow-name",\n', '    const flowNameInput = node("input", {\n      class: "primitive-field",\n      id: "primitive-flow-name",\n', "shell flow name")
replace(shell, '      name,\n      node("div", { class: "primitive-form-grid", style: "margin-top:7px" }, [\n', '      flowNameInput,\n      node("div", { class: "primitive-form-grid", style: "margin-top:7px" }, [\n', "shell flow form")
replace(shell, '            if (!name.value.trim()) {\n              name.focus();\n', '            if (!flowNameInput.value.trim()) {\n              flowNameInput.focus();\n', "shell flow validation")
replace(shell, '              name: name.value.trim(),\n', '              name: flowNameInput.value.trim(),\n', "shell flow value")

print("Primitive semantic lint normalization complete.")
