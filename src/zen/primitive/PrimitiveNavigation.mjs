// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Primitive Browser navigation and handoff utilities.
// Enhances the command center with live tabs/saved resources and provides a
// portable state snapshot for later Workspace migration without changing the
// browser-side storage model in this prototype.

const SYSTEM_PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();
const SNAPSHOT_VERSION = 1;
const STATE_KEYS = [
  "pages",
  "notes",
  "prompts",
  "deploymentTargets",
  "flows",
  "canvasNodes",
  "tabSets",
];

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

function copyText(text) {
  try {
    const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
      Ci.nsIClipboardHelper
    );
    helper.copyString(text);
    return true;
  } catch (error) {
    console.error("[Primitive] Clipboard copy failed", error);
    return false;
  }
}

class PrimitiveNavigation {
  constructor(shell) {
    this.shell = shell;
    this.baseOpenCommand = shell.openCommand.bind(shell);
    this.dynamicMarker = "primitive-dynamic";
    this.installed = false;
  }

  init() {
    if (this.installed) return;
    this.installed = true;
    this.installStaticCommands();
    this.wrapCommandCenter();
    window.gPrimitiveNavigation = this;
  }

  openTabs() {
    return Array.from(window.gBrowser?.tabs || []).filter(
      tab => !tab.closing && tabUrl(tab)
    );
  }

  captureTabSet() {
    const tabs = this.openTabs().map((tab, index) => ({
      index,
      title: tabTitle(tab),
      url: tabUrl(tab),
      pinned: Boolean(tab.pinned),
      selected: tab === window.gBrowser.selectedTab,
      userContextId: tab.userContextId || 0,
    }));

    if (!tabs.length) {
      this.shell.notify("There are no tabs to save.");
      return;
    }

    const sets = this.shell.store.read("tabSets", []);
    const now = new Date();
    sets.unshift({
      id: `tabset-${Date.now().toString(36)}`,
      title: `Window · ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      createdAt: now.toISOString(),
      tabs,
    });
    this.shell.store.write("tabSets", sets.slice(0, 30));
    this.shell.notify(`Saved ${tabs.length} tabs as a local tab set.`);
  }

  restoreLatestTabSet() {
    const set = this.shell.store.read("tabSets", [])[0];
    if (!set?.tabs?.length) {
      this.shell.notify("No saved tab set exists yet.");
      return;
    }

    let selected = null;
    for (const record of set.tabs) {
      try {
        const tab = window.gBrowser.addTab(record.url, {
          triggeringPrincipal: SYSTEM_PRINCIPAL,
          userContextId: record.userContextId || 0,
        });
        if (record.pinned) {
          window.gBrowser.pinTab(tab);
        }
        if (record.selected) {
          selected = tab;
        }
      } catch (error) {
        console.warn("[Primitive] Could not restore tab", record.url, error);
      }
    }

    if (selected) {
      window.gBrowser.selectedTab = selected;
    }
    this.shell.closeCommand();
    this.shell.notify(`Restored ${set.tabs.length} tabs from ${set.title}.`);
  }

  snapshot() {
    const state = Object.fromEntries(
      STATE_KEYS.map(key => [key, this.shell.store.read(key, [])])
    );

    return {
      schema: "primitive-browser-local-state",
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      source: {
        product: "Primitive Browser",
        layer: "zen-firefox-prototype",
      },
      activeContext: this.shell.currentPage(),
      openTabs: this.openTabs().map(tab => ({
        title: tabTitle(tab),
        url: tabUrl(tab),
        pinned: Boolean(tab.pinned),
        selected: tab === window.gBrowser.selectedTab,
      })),
      state,
    };
  }

  copyStateSnapshot() {
    const payload = JSON.stringify(this.snapshot(), null, 2);
    if (copyText(payload)) {
      this.shell.closeCommand();
      this.shell.notify("Primitive local state JSON copied to clipboard.");
    } else {
      this.shell.notify("Could not access the browser clipboard.");
    }
  }

  copyPageContext() {
    const payload = JSON.stringify(
      {
        schema: "primitive-browser-page-context",
        version: 1,
        capturedAt: new Date().toISOString(),
        page: this.shell.currentPage(),
      },
      null,
      2
    );
    if (copyText(payload)) {
      this.shell.closeCommand();
      this.shell.notify("Current page context copied as JSON.");
    }
  }

  installStaticCommands() {
    this.shell.commands.push(
      {
        group: "Navigate",
        icon: "▦",
        title: "Save window as tab set",
        detail: "Capture every open tab so this browsing state can be restored",
        run: () => this.captureTabSet(),
      },
      {
        group: "Navigate",
        icon: "↶",
        title: "Restore latest tab set",
        detail: "Reopen the most recently captured browser window",
        run: () => this.restoreLatestTabSet(),
      },
      {
        group: "Portable data",
        icon: "{}",
        title: "Copy current page context as JSON",
        detail: "Portable browser context for debugging and future Workspace wiring",
        run: () => this.copyPageContext(),
      },
      {
        group: "Portable data",
        icon: "⇩",
        title: "Copy Primitive state snapshot",
        detail: "Pages, notes, staged prompts, deployments, flows, canvas and tab sets",
        run: () => this.copyStateSnapshot(),
      }
    );
  }

  removeDynamicCommands() {
    this.shell.commands = this.shell.commands.filter(
      command => command.__primitiveMarker !== this.dynamicMarker
    );
  }

  addLiveTabCommands() {
    for (const tab of this.openTabs().slice(0, 35)) {
      const url = tabUrl(tab);
      const title = tabTitle(tab);
      this.shell.commands.push({
        __primitiveMarker: this.dynamicMarker,
        group: "Open tabs",
        icon: tab.pinned ? "◆" : "○",
        title,
        detail: hostFor(url),
        run: () => {
          window.gBrowser.selectedTab = tab;
          this.shell.closeCommand();
        },
      });
    }
  }

  addSavedResourceCommands() {
    const saved = this.shell.store.read("pages", []);
    for (const page of saved.slice(0, 25)) {
      this.shell.commands.push({
        __primitiveMarker: this.dynamicMarker,
        group: "Saved resources",
        icon: "▤",
        title: page.title || page.url || "Saved page",
        detail: hostFor(page.url || ""),
        run: () => this.shell.openUrl(page.url),
      });
    }
  }

  wrapCommandCenter() {
    this.shell.openCommand = (...args) => {
      this.removeDynamicCommands();
      this.addLiveTabCommands();
      this.addSavedResourceCommands();
      return this.baseOpenCommand(...args);
    };
  }
}

function initializeNavigation(attempt = 0) {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    if (attempt < 120) {
      requestAnimationFrame(() => initializeNavigation(attempt + 1));
    } else {
      console.error("[Primitive] Navigation enhancement could not find shell");
    }
    return;
  }

  const primitiveNavigation = new PrimitiveNavigation(shell);
  primitiveNavigation.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeNavigation(), {
    once: true,
  });
} else {
  initializeNavigation();
}
