// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Primitive Browser split-view integration.
// Uses Zen's canonical gZenViewSplitter implementation; Primitive only adds a
// faster command-center affordance and never forks the split layout engine.

const DYNAMIC_MARKER = "primitive-split-dynamic";

function tabUrl(tab) {
  return tab?.linkedBrowser?.currentURI?.spec || "";
}

function tabTitle(tab) {
  return tab?.label || tabUrl(tab) || "Untitled tab";
}

function hostFor(url) {
  try {
    return new URL(url).host || url;
  } catch (_) {
    return url;
  }
}

class PrimitiveSplitIntegration {
  constructor(shell) {
    this.shell = shell;
    this.baseOpenCommand = shell.openCommand.bind(shell);
  }

  init() {
    if (this.shell.__primitiveSplitIntegrated) {
      return;
    }
    this.shell.__primitiveSplitIntegrated = true;

    this.shell.commands.push({
      group: "Split view",
      icon: "◫",
      title: "Create empty split",
      detail: "Use Zen's native split view beside the current page",
      run: () => this.createEmptySplit(),
    });

    this.shell.openCommand = (...args) => {
      this.refreshDynamicCommands();
      return this.baseOpenCommand(...args);
    };

    window.gPrimitiveSplitIntegration = this;
  }

  splitter() {
    return window.gZenViewSplitter || null;
  }

  canUseSplit() {
    const splitter = this.splitter();
    return Boolean(
      splitter &&
      typeof splitter.splitTabs === "function" &&
      typeof splitter.createEmptySplit === "function"
    );
  }

  createEmptySplit() {
    const splitter = this.splitter();
    if (!splitter || typeof splitter.createEmptySplit !== "function") {
      this.shell.notify("Zen split view is unavailable in this window.");
      return;
    }

    try {
      splitter.createEmptySplit();
      this.shell.closeCommand();
    } catch (error) {
      console.error("[Primitive] Could not create Zen split view", error);
      this.shell.notify("Could not create the split view.");
    }
  }

  splitWith(tab) {
    const splitter = this.splitter();
    const current = window.gBrowser?.selectedTab;
    if (!splitter || !current || !tab || current === tab) {
      return;
    }

    try {
      const result = splitter.splitTabs([current, tab], undefined, 0);
      if (!result && !current.splitView && !tab.splitView) {
        this.shell.notify("Zen did not create a split for those tabs.");
        return;
      }
      this.shell.closeCommand();
    } catch (error) {
      console.error("[Primitive] Could not split tabs", error);
      this.shell.notify("Could not place those tabs in split view.");
    }
  }

  refreshDynamicCommands() {
    this.shell.commands = this.shell.commands.filter(
      command => command.__primitiveMarker !== DYNAMIC_MARKER
    );

    if (!this.canUseSplit()) {
      return;
    }
    const current = window.gBrowser?.selectedTab;
    const tabs = Array.from(window.gBrowser?.tabs || []).filter(
      tab => tab && !tab.closing && tab !== current && tabUrl(tab)
    );

    for (const tab of tabs.slice(0, 18)) {
      const url = tabUrl(tab);
      this.shell.commands.push({
        __primitiveMarker: DYNAMIC_MARKER,
        group: "Split with open tab",
        icon: "◧",
        title: tabTitle(tab),
        detail: hostFor(url),
        run: () => this.splitWith(tab),
      });
    }
  }
}

function initializeSplit(attempt = 0) {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    if (attempt < 120) {
      requestAnimationFrame(() => initializeSplit(attempt + 1));
    } else {
      console.error("[Primitive] Split integration could not find shell");
    }
    return;
  }

  const integration = new PrimitiveSplitIntegration(shell);
  integration.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeSplit(), {
    once: true,
  });
} else {
  initializeSplit();
}
