// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Primitive Browser active-context enrichment.
// Extends the shell's page context with native Zen/Firefox state while keeping
// the data shape browser-only and serializable for later Workspace bridging.

const HTML_NS = "http://www.w3.org/1999/xhtml";
const DYNAMIC_MARKER = "primitive-context-dynamic";

function html(tag, className, text) {
  const element = document.createElementNS(HTML_NS, tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

class PrimitiveContextIntegration {
  constructor(shell) {
    this.shell = shell;
    this.baseCurrentPage = shell.currentPage.bind(shell);
    this.basePageContextCard = shell.pageContextCard.bind(shell);
    this.baseOpenCommand = shell.openCommand.bind(shell);
    this.prefObserver = this.onWorkspacePrefChange.bind(this);
  }

  init() {
    if (this.shell.__primitiveContextIntegrated) {
      return;
    }
    this.shell.__primitiveContextIntegrated = true;

    this.wrapCurrentPage();
    this.wrapContextCard();
    this.wrapCommandCenter();

    Services.prefs.addObserver("zen.workspaces.active", this.prefObserver);
    window.addEventListener(
      "unload",
      () =>
        Services.prefs.removeObserver(
          "zen.workspaces.active",
          this.prefObserver
        ),
      { once: true }
    );

    window.gBrowser?.tabContainer?.addEventListener("TabPinned", () =>
      this.refreshVisibleContext()
    );
    window.gBrowser?.tabContainer?.addEventListener("TabUnpinned", () =>
      this.refreshVisibleContext()
    );

    this.refreshVisibleContext();
    window.gPrimitiveContextIntegration = this;
  }

  workspaceFor(tab) {
    const manager = window.gZenWorkspaces;
    if (!manager) {
      return null;
    }
    const id =
      tab?.getAttribute?.("zen-workspace-id") || manager.activeWorkspace || "";
    try {
      const workspace = manager.getWorkspaceFromId?.(id);
      if (!workspace) {
        return null;
      }
      return {
        id: workspace.uuid,
        name: workspace.name || "Workspace",
        icon: workspace.icon || "",
      };
    } catch (_) {
      return null;
    }
  }

  enrichedContext() {
    const base = this.baseCurrentPage();
    const tab = window.gBrowser?.selectedTab;
    let isPrivate = false;
    try {
      isPrivate = Boolean(
        window.PrivateBrowsingUtils?.isWindowPrivate?.(window)
      );
    } catch (_) {}

    return {
      ...base,
      workspace: this.workspaceFor(tab),
      tab: {
        pinned: Boolean(tab?.pinned),
        split: Boolean(tab?.splitView),
        containerId: Number(tab?.userContextId || 0),
        private: isPrivate,
      },
    };
  }

  wrapCurrentPage() {
    this.shell.currentPage = () => this.enrichedContext();
  }

  wrapContextCard() {
    this.shell.pageContextCard = () => {
      const card = this.basePageContextCard();
      const context = this.shell.currentPage();
      const badges = html("div", "primitive-actions");
      badges.style.marginTop = "8px";

      if (context.workspace?.name) {
        badges.append(html("span", "primitive-badge", context.workspace.name));
      }
      if (context.tab?.pinned) {
        badges.append(html("span", "primitive-badge", "Pinned"));
      }
      if (context.tab?.split) {
        badges.append(html("span", "primitive-badge", "Split"));
      }
      if (context.tab?.containerId) {
        badges.append(
          html(
            "span",
            "primitive-badge",
            `Container ${context.tab.containerId}`
          )
        );
      }
      if (context.tab?.private) {
        badges.append(html("span", "primitive-badge", "Private"));
      }

      if (badges.childElementCount) {
        card.append(badges);
      }
      return card;
    };
  }

  wrapCommandCenter() {
    this.shell.openCommand = (...args) => {
      this.refreshDynamicCommands();
      return this.baseOpenCommand(...args);
    };
  }

  refreshDynamicCommands() {
    this.shell.commands = this.shell.commands.filter(
      command => command.__primitiveMarker !== DYNAMIC_MARKER
    );

    const tab = window.gBrowser?.selectedTab;
    if (!tab) {
      return;
    }

    this.shell.commands.push({
      __primitiveMarker: DYNAMIC_MARKER,
      group: "Current tab",
      icon: tab.pinned ? "◇" : "◆",
      title: tab.pinned ? "Unpin current tab" : "Pin current tab",
      detail: tab.pinned
        ? "Return this page to the normal tab list"
        : "Keep this page available in the current Zen workspace",
      run: () => {
        try {
          if (tab.pinned) {
            window.gBrowser.unpinTab(tab);
            this.shell.notify("Tab unpinned.");
          } else {
            window.gBrowser.pinTab(tab);
            this.shell.notify("Tab pinned.");
          }
          this.shell.closeCommand();
          this.refreshVisibleContext();
        } catch (error) {
          console.error("[Primitive] Could not change pin state", error);
        }
      },
    });
  }

  onWorkspacePrefChange() {
    requestAnimationFrame(() => this.refreshVisibleContext());
  }

  refreshVisibleContext() {
    if (!this.shell.panel || this.shell.panel.hidden) {
      return;
    }

    const subtitle = this.shell.panel.querySelector(
      ".primitive-brand__subtitle"
    );
    const context = this.shell.currentPage();
    if (subtitle) {
      subtitle.textContent =
        [context.workspace?.name, context.host].filter(Boolean).join(" · ") ||
        "Browser workspace";
    }

    if (["home", "ask", "notes"].includes(this.shell.store.mode)) {
      this.shell.renderSurface(this.shell.store.mode);
    }
  }
}

function initializeContext(attempt = 0) {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    if (attempt < 120) {
      requestAnimationFrame(() => initializeContext(attempt + 1));
    } else {
      console.error("[Primitive] Context integration could not find shell");
    }
    return;
  }

  const integration = new PrimitiveContextIntegration(shell);
  integration.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeContext(), {
    once: true,
  });
} else {
  initializeContext();
}
