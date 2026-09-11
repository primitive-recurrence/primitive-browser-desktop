// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Primitive Browser integration with Zen workspaces.
// Primitive surfaces existing workspaces as navigation/context commands rather
// than introducing a second workspace database before Workspace wiring exists.

const DYNAMIC_MARKER = "primitive-spaces-dynamic";

function workspaceLabel(workspace) {
  if (!workspace) return "Workspace";
  const icon = workspace.icon && !String(workspace.icon).endsWith(".svg")
    ? `${workspace.icon} `
    : "";
  return `${icon}${workspace.name || "Workspace"}`.trim();
}

class PrimitiveSpacesIntegration {
  constructor(shell) {
    this.shell = shell;
    this.baseOpenCommand = shell.openCommand.bind(shell);
    this.ready = false;
  }

  async init() {
    if (this.shell.__primitiveSpacesIntegrated) return;
    this.shell.__primitiveSpacesIntegrated = true;

    const manager = window.gZenWorkspaces;
    if (!manager) {
      console.warn("[Primitive] Zen workspace manager unavailable");
      return;
    }

    try {
      await manager.promiseInitialized;
    } catch (error) {
      console.warn("[Primitive] Zen workspaces did not initialize cleanly", error);
    }

    this.ready = true;
    this.installNavigationCommands();
    this.wrapCommandCenter();
    window.gPrimitiveSpacesIntegration = this;
  }

  manager() {
    return window.gZenWorkspaces || null;
  }

  workspaces() {
    try {
      return this.manager()?.getWorkspaces?.() || [];
    } catch (error) {
      console.warn("[Primitive] Could not read Zen workspaces", error);
      return [];
    }
  }

  activeWorkspace() {
    const manager = this.manager();
    return this.workspaces().find(space => space.uuid === manager?.activeWorkspace) || null;
  }

  installNavigationCommands() {
    this.shell.commands.push(
      {
        group: "Workspaces",
        icon: "←",
        title: "Previous workspace",
        detail: "Use Zen's native workspace navigation",
        run: () => this.stepWorkspace(-1),
      },
      {
        group: "Workspaces",
        icon: "→",
        title: "Next workspace",
        detail: "Use Zen's native workspace navigation",
        run: () => this.stepWorkspace(1),
      }
    );
  }

  stepWorkspace(direction) {
    const manager = this.manager();
    if (!manager) return;
    try {
      if (typeof manager.changeWorkspaceShortcut === "function") {
        manager.changeWorkspaceShortcut(direction);
      } else {
        const spaces = this.workspaces();
        if (!spaces.length) return;
        const current = Math.max(
          0,
          spaces.findIndex(space => space.uuid === manager.activeWorkspace)
        );
        const next = (current + direction + spaces.length) % spaces.length;
        manager.changeWorkspace(spaces[next]);
      }
      this.shell.closeCommand();
    } catch (error) {
      console.error("[Primitive] Could not change Zen workspace", error);
      this.shell.notify("Could not switch workspace.");
    }
  }

  async switchWorkspace(workspace) {
    const manager = this.manager();
    if (!manager || !workspace) return;
    try {
      await manager.changeWorkspace(workspace);
      this.shell.closeCommand();
      this.shell.notify(`Workspace: ${workspaceLabel(workspace)}`);
    } catch (error) {
      console.error("[Primitive] Could not switch workspace", error);
      this.shell.notify("Could not switch workspace.");
    }
  }

  async moveCurrentTab(workspace) {
    const manager = this.manager();
    const tab = window.gBrowser?.selectedTab;
    if (!manager || !tab || !workspace) return;

    try {
      if (typeof manager.moveTabToWorkspace !== "function") {
        this.shell.notify("This Zen build does not expose tab movement.");
        return;
      }
      await manager.moveTabToWorkspace(tab, workspace.uuid);
      this.shell.closeCommand();
      this.shell.notify(`Moved tab to ${workspaceLabel(workspace)}.`);
    } catch (error) {
      console.error("[Primitive] Could not move tab to workspace", error);
      this.shell.notify("Could not move the tab to that workspace.");
    }
  }

  refreshDynamicCommands() {
    this.shell.commands = this.shell.commands.filter(
      command => command.__primitiveMarker !== DYNAMIC_MARKER
    );

    if (!this.ready) return;
    const manager = this.manager();
    const activeId = manager?.activeWorkspace;

    for (const workspace of this.workspaces().slice(0, 20)) {
      const active = workspace.uuid === activeId;
      const label = workspaceLabel(workspace);
      this.shell.commands.push({
        __primitiveMarker: DYNAMIC_MARKER,
        group: "Switch workspace",
        icon: active ? "●" : "○",
        title: label,
        detail: active ? "Current Zen workspace" : "Switch browser context",
        run: () => this.switchWorkspace(workspace),
      });

      if (!active) {
        this.shell.commands.push({
          __primitiveMarker: DYNAMIC_MARKER,
          group: "Move current tab",
          icon: "⇥",
          title: `Move to ${label}`,
          detail: "Move this tab using Zen's native workspace ownership",
          run: () => this.moveCurrentTab(workspace),
        });
      }
    }
  }

  wrapCommandCenter() {
    this.shell.openCommand = (...args) => {
      this.refreshDynamicCommands();
      return this.baseOpenCommand(...args);
    };
  }
}

function initializeSpaces(attempt = 0) {
  const shell = window.gPrimitiveShell;
  if (!shell || !window.gZenWorkspaces) {
    if (attempt < 180) {
      requestAnimationFrame(() => initializeSpaces(attempt + 1));
    } else {
      console.warn("[Primitive] Workspace integration skipped for this window");
    }
    return;
  }

  const integration = new PrimitiveSpacesIntegration(shell);
  integration.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeSpaces(), {
    once: true,
  });
} else {
  initializeSpaces();
}
