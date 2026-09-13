// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Primitive Browser interaction refinements.
// Keeps layout/search behavior separate from the core shell so upstream Zen
// conflicts remain small and easy to diagnose during the first executable run.

const PREF_PREFIX = "primitive.browser.shell.";
const MIN_PANEL_WIDTH = 340;
const MAX_PANEL_WIDTH = 720;
const DEFAULT_PANEL_WIDTH = 430;
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

function isLikelyUrl(value) {
  const text = value.trim();
  if (!text || /\s/.test(text)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return true;
  }
  if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(?:\/|$)/i.test(text)) {
    return true;
  }
  return text.includes(".");
}

async function enhanceSearch(shell) {
  if (shell.__primitiveSearchEnhanced) {
    return;
  }
  shell.__primitiveSearchEnhanced = true;
  const openUrl = shell.openUrl.bind(shell);

  shell.openUrl = async rawValue => {
    const value = String(rawValue || "").trim();
    if (!value || isLikelyUrl(value)) {
      return openUrl(value);
    }

    try {
      const engine = await lazy.SearchService.getDefault();
      const submission = engine?.getSubmission(value, null, "keyword");
      if (submission?.uri?.spec) {
        return openUrl(submission.uri.spec);
      }
    } catch (error) {
      console.warn("[Primitive] Default search submission unavailable", error);
    }

    // Honest fallback: stage the query in Firefox's own address bar and leave
    // execution to the user rather than constructing an unreliable search URL.
    shell.closeCommand();
    if (window.gURLBar) {
      window.gURLBar.value = value;
      window.gURLBar.focus();
      window.gURLBar.select();
      shell.notify("Search staged in the address bar — press Enter.");
    }
    return undefined;
  };
}

class PrimitivePanelLayout {
  constructor(shell) {
    this.shell = shell;
    this.panel = shell.panel;
    this.width = Math.min(
      MAX_PANEL_WIDTH,
      Math.max(
        MIN_PANEL_WIDTH,
        Services.prefs.getIntPref(
          `${PREF_PREFIX}panelWidth`,
          DEFAULT_PANEL_WIDTH
        )
      )
    );
    this.docked = Services.prefs.getBoolPref(
      `${PREF_PREFIX}panelDocked`,
      false
    );
    this.resizeHandle = null;
    this.dockButton = null;
  }

  init() {
    if (!this.panel || this.panel.dataset.layoutReady === "true") {
      return;
    }
    this.panel.dataset.layoutReady = "true";
    this.installDockButton();
    this.installResizeHandle();
    this.wrapVisibilityMethods();
    this.sync();
  }

  installDockButton() {
    const header = this.panel.querySelector(".primitive-panel__header");
    const closeButton = header?.querySelector(
      ".primitive-icon-button:last-child"
    );
    if (!header || !closeButton) {
      return;
    }

    const button = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button"
    );
    button.className = "primitive-icon-button";
    button.type = "button";
    button.setAttribute("aria-label", "Dock or float Primitive panel");
    button.addEventListener("click", () => this.toggleDock());
    header.insertBefore(button, closeButton);
    this.dockButton = button;
    this.updateDockButton();
  }

  installResizeHandle() {
    const handle = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    handle.className = "primitive-panel__resize-handle";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", "Resize Primitive panel");
    handle.tabIndex = 0;

    handle.addEventListener("pointerdown", event => this.beginResize(event));
    handle.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? 1 : -1;
      const step = event.shiftKey ? 40 : 10;
      this.setWidth(this.width + direction * step, true);
    });
    handle.addEventListener("dblclick", () => {
      this.setWidth(DEFAULT_PANEL_WIDTH, true);
    });

    this.panel.prepend(handle);
    this.resizeHandle = handle;
  }

  beginResize(event) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width;
    this.resizeHandle.setPointerCapture(event.pointerId);
    this.panel.dataset.resizing = "true";

    const move = moveEvent => {
      this.setWidth(startWidth + startX - moveEvent.clientX, false);
    };
    const up = upEvent => {
      this.resizeHandle.releasePointerCapture(upEvent.pointerId);
      this.resizeHandle.removeEventListener("pointermove", move);
      this.resizeHandle.removeEventListener("pointerup", up);
      delete this.panel.dataset.resizing;
      Services.prefs.setIntPref(
        `${PREF_PREFIX}panelWidth`,
        Math.round(this.width)
      );
    };

    this.resizeHandle.addEventListener("pointermove", move);
    this.resizeHandle.addEventListener("pointerup", up);
  }

  setWidth(value, persist) {
    this.width = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, value));
    document.documentElement.style.setProperty(
      "--primitive-panel-width",
      `${Math.round(this.width)}px`
    );
    if (persist) {
      Services.prefs.setIntPref(
        `${PREF_PREFIX}panelWidth`,
        Math.round(this.width)
      );
    }
  }

  toggleDock() {
    this.docked = !this.docked;
    Services.prefs.setBoolPref(`${PREF_PREFIX}panelDocked`, this.docked);
    this.sync();
    this.shell.notify(
      this.docked
        ? "Primitive panel docked to the browser workspace."
        : "Primitive panel is floating over the browser."
    );
  }

  updateDockButton() {
    if (!this.dockButton) {
      return;
    }
    this.dockButton.textContent = this.docked ? "▰" : "▱";
    this.dockButton.title = this.docked
      ? "Undock Primitive panel"
      : "Dock Primitive panel";
    this.dockButton.setAttribute("aria-pressed", String(this.docked));
  }

  wrapVisibilityMethods() {
    if (this.shell.__primitiveLayoutWrapped) {
      return;
    }
    this.shell.__primitiveLayoutWrapped = true;

    for (const methodName of ["openPanel", "closePanel", "togglePanel"]) {
      const original = this.shell[methodName]?.bind(this.shell);
      if (!original) {
        continue;
      }
      this.shell[methodName] = (...args) => {
        const result = original(...args);
        this.sync();
        return result;
      };
    }
  }

  sync() {
    this.setWidth(this.width, false);
    this.panel.dataset.docked = String(this.docked);
    this.updateDockButton();

    if (!this.panel.hidden) {
      document.documentElement.setAttribute("primitive-panel-open", "true");
    } else {
      document.documentElement.removeAttribute("primitive-panel-open");
    }

    if (this.docked) {
      document.documentElement.setAttribute("primitive-panel-docked", "true");
    } else {
      document.documentElement.removeAttribute("primitive-panel-docked");
    }
  }
}

function initializeExperience(attempt = 0) {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    if (attempt < 120) {
      requestAnimationFrame(() => initializeExperience(attempt + 1));
    } else {
      console.error("[Primitive] Experience enhancement could not find shell");
    }
    return;
  }
  enhanceSearch(shell);
  const layout = new PrimitivePanelLayout(shell);
  layout.init();
  window.gPrimitivePanelLayout = layout;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeExperience(), {
    once: true,
  });
} else {
  initializeExperience();
}
