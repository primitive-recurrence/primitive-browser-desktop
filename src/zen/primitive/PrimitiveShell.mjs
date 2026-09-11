// Primitive Browser shell controller.
//
// This module intentionally owns only browser-side interaction state. It does
// not import Primitive Workspace, simulate AI, execute an operating-system
// shell, or make deployment claims. Those seams are explicit in the UI so the
// browser can be reviewed independently before runtime wiring begins.

const HTML_NS = "http://www.w3.org/1999/xhtml";
const PREF_PREFIX = "primitive.browser.shell.";
const SYSTEM_PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();

const SURFACES = [
  ["home", "⌂", "Home"],
  ["ask", "✦", "Ask"],
  ["notes", "▤", "Notes"],
  ["deploy", "↗", "Deploy"],
  ["flows", "⇢", "Flows"],
  ["canvas", "◇", "Canvas"],
  ["terminal", "›_", "Console"],
];

function node(tag, attrs = {}, children = []) {
  const element = document.createElementNS(HTML_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key === "class") {
      element.className = value;
    } else if (key === "text") {
      element.textContent = value;
    } else if (key === "hidden") {
      element.hidden = Boolean(value);
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        element.dataset[dataKey] = String(dataValue);
      }
    } else {
      element.setAttribute(key, String(value));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) {
      continue;
    }
    element.append(
      typeof child === "string" ? document.createTextNode(child) : child
    );
  }
  return element;
}

function button(label, options = {}) {
  const classes = ["primitive-button"];
  if (options.primary) classes.push("primitive-button--primary");
  if (options.ghost) classes.push("primitive-button--ghost");
  return node(
    "button",
    {
      class: classes.join(" "),
      type: "button",
      title: options.title,
      onclick: options.onclick,
    },
    [label]
  );
}

function section(eyebrow, title, copy) {
  const children = [];
  if (eyebrow) {
    children.push(node("div", { class: "primitive-eyebrow", text: eyebrow }));
  }
  if (title) {
    children.push(node("h2", { class: "primitive-heading", text: title }));
  }
  if (copy) {
    children.push(node("p", { class: "primitive-copy", text: copy }));
  }
  return node("section", { class: "primitive-section" }, children);
}

function safeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shorten(value, limit = 82) {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

class PrimitiveStore {
  read(key, fallback) {
    try {
      const raw = Services.prefs.getStringPref(`${PREF_PREFIX}${key}`, "");
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`[Primitive] Could not read ${key}`, error);
      return fallback;
    }
  }

  write(key, value) {
    try {
      Services.prefs.setStringPref(`${PREF_PREFIX}${key}`, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[Primitive] Could not persist ${key}`, error);
      return false;
    }
  }

  get panelOpen() {
    return Services.prefs.getBoolPref(`${PREF_PREFIX}panelOpen`, false);
  }

  set panelOpen(value) {
    Services.prefs.setBoolPref(`${PREF_PREFIX}panelOpen`, Boolean(value));
  }

  get mode() {
    return Services.prefs.getStringPref(`${PREF_PREFIX}mode`, "home");
  }

  set mode(value) {
    Services.prefs.setStringPref(`${PREF_PREFIX}mode`, value);
  }
}

class PrimitiveBrowserShell {
  constructor() {
    this.store = new PrimitiveStore();
    this.root = null;
    this.panel = null;
    this.panelBody = null;
    this.command = null;
    this.commandInput = null;
    this.commandResults = null;
    this.toast = null;
    this.toastTimer = null;
    this.selectedCommandIndex = 0;
    this.terminalLines = [
      "Primitive browser console",
      "Browser-safe commands only. Type `help` for commands.",
      "",
    ];
    this.boundKeydown = this.onKeydown.bind(this);
    this.boundTabChange = this.onTabChange.bind(this);

    this.commands = [
      {
        group: "Navigate",
        icon: "⌕",
        title: "Focus address bar",
        detail: "Search the web, open a URL, or use a search engine",
        shortcut: "Ctrl L",
        run: () => this.focusAddressBar(),
      },
      {
        group: "Navigate",
        icon: "+",
        title: "New tab",
        detail: "Open a clean browser tab",
        shortcut: "Ctrl T",
        run: () => this.newTab(),
      },
      {
        group: "Primitive",
        icon: "✦",
        title: "Open Ask",
        detail: "Stage a question with the current page as context",
        run: () => this.openSurface("ask"),
      },
      {
        group: "Primitive",
        icon: "▤",
        title: "Save current page",
        detail: "Keep this page in the local Primitive notebook",
        run: () => this.saveCurrentPage(),
      },
      {
        group: "Primitive",
        icon: "✎",
        title: "Open Notes",
        detail: "Pages and notes captured locally in this browser",
        run: () => this.openSurface("notes"),
      },
      {
        group: "Build",
        icon: "↗",
        title: "Open Deployments",
        detail: "Manage deployment endpoints and future Coolify adapters",
        run: () => this.openSurface("deploy"),
      },
      {
        group: "Build",
        icon: "⇢",
        title: "Open Workflows",
        detail: "Draft browser-native automations and integration flows",
        run: () => this.openSurface("flows"),
      },
      {
        group: "Build",
        icon: "◇",
        title: "Open Canvas",
        detail: "Arrange pages and ideas spatially",
        run: () => this.openSurface("canvas"),
      },
      {
        group: "Tools",
        icon: "›_",
        title: "Open browser console",
        detail: "Safe Primitive commands; OS execution remains disconnected",
        run: () => this.openSurface("terminal"),
      },
      {
        group: "Tools",
        icon: "↓",
        title: "Downloads",
        detail: "Open Firefox downloads",
        run: () => this.openUrl("about:downloads"),
      },
      {
        group: "Tools",
        icon: "⚙",
        title: "Browser settings",
        detail: "Open Firefox / Zen preferences",
        run: () => this.openUrl("about:preferences"),
      },
      {
        group: "Tools",
        icon: "⊕",
        title: "Extensions",
        detail: "Open browser add-ons",
        run: () => this.openUrl("about:addons"),
      },
    ];
  }

  init() {
    if (this.root || !document.body) {
      return;
    }

    this.installToolbarButton();
    this.root = node("div", { id: "primitive-shell-root" });
    this.panel = node("aside", {
      class: "primitive-panel",
      role: "complementary",
      "aria-label": "Primitive browser panel",
      hidden: !this.store.panelOpen,
    });
    this.command = node("div", {
      class: "primitive-command",
      role: "presentation",
      hidden: true,
    });
    this.toast = node("div", {
      class: "primitive-toast",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    });

    this.root.append(this.panel, this.command, this.toast);
    document.body.append(this.root);

    this.renderPanelChrome();
    this.renderCommand();
    this.renderSurface(this.store.mode);

    window.addEventListener("keydown", this.boundKeydown, true);
    window.gBrowser?.tabContainer?.addEventListener(
      "TabSelect",
      this.boundTabChange
    );
    window.gBrowser?.tabContainer?.addEventListener(
      "TabAttrModified",
      this.boundTabChange
    );

    window.gPrimitiveShell = this;
    console.info("[Primitive] Browser shell initialized");
  }

  destroy() {
    window.removeEventListener("keydown", this.boundKeydown, true);
    window.gBrowser?.tabContainer?.removeEventListener(
      "TabSelect",
      this.boundTabChange
    );
    window.gBrowser?.tabContainer?.removeEventListener(
      "TabAttrModified",
      this.boundTabChange
    );
    document.getElementById("primitive-toolbar-button")?.remove();
    this.root?.remove();
    this.root = null;
  }

  installToolbarButton() {
    if (document.getElementById("primitive-toolbar-button")) {
      return;
    }
    const target =
      document.getElementById("nav-bar-customization-target") ||
      document.getElementById("nav-bar");
    if (!target) {
      return;
    }

    const toolbarButton = document.createXULElement("toolbarbutton");
    toolbarButton.id = "primitive-toolbar-button";
    toolbarButton.className = "toolbarbutton-1 chromeclass-toolbar-additional";
    toolbarButton.setAttribute("label", "Primitive");
    toolbarButton.setAttribute("tooltiptext", "Primitive — open browser workspace");
    toolbarButton.setAttribute("removable", "true");
    toolbarButton.setAttribute(
      "image",
      "chrome://browser/content/primitive/assets/primitive-mark.svg"
    );
    toolbarButton.addEventListener("command", () => this.togglePanel());
    target.append(toolbarButton);
  }

  currentPage() {
    const browser = window.gBrowser?.selectedBrowser;
    const tab = window.gBrowser?.selectedTab;
    const url = browser?.currentURI?.spec || "";
    const title = tab?.label || browser?.contentTitle || url || "Untitled";
    let host = "";
    try {
      host = new URL(url).host;
    } catch (_) {}
    return { title, url, host };
  }

  openUrl(rawUrl) {
    let url = rawUrl.trim();
    if (!url) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      url = `https://${url}`;
    }
    try {
      const tab = window.gBrowser.addTab(url, {
        triggeringPrincipal: SYSTEM_PRINCIPAL,
      });
      window.gBrowser.selectedTab = tab;
      this.closeCommand();
    } catch (error) {
      console.error("[Primitive] Failed to open URL", error);
      this.notify("Could not open that URL.");
    }
  }

  newTab() {
    try {
      const tab = window.gBrowser.addTab("about:newtab", {
        triggeringPrincipal: SYSTEM_PRINCIPAL,
      });
      window.gBrowser.selectedTab = tab;
      this.closeCommand();
    } catch (error) {
      console.error("[Primitive] Failed to create tab", error);
    }
  }

  focusAddressBar() {
    this.closeCommand();
    window.gURLBar?.focus();
    window.gURLBar?.select();
  }

  togglePanel() {
    const open = this.panel.hidden;
    this.panel.hidden = !open;
    this.store.panelOpen = open;
    if (open) {
      this.renderSurface(this.store.mode);
    }
  }

  openPanel() {
    this.panel.hidden = false;
    this.store.panelOpen = true;
  }

  closePanel() {
    this.panel.hidden = true;
    this.store.panelOpen = false;
  }

  openSurface(mode) {
    const exists = SURFACES.some(([id]) => id === mode);
    const safeMode = exists ? mode : "home";
    this.store.mode = safeMode;
    this.openPanel();
    this.renderSurface(safeMode);
    this.closeCommand();
  }

  renderPanelChrome() {
    const page = this.currentPage();
    const brand = node("div", { class: "primitive-brand" }, [
      node("div", { class: "primitive-brand__mark", text: "P" }),
      node("div", { class: "primitive-brand__copy" }, [
        node("div", { class: "primitive-brand__title", text: "Primitive" }),
        node("div", {
          class: "primitive-brand__subtitle",
          text: page.host || "Browser workspace",
        }),
      ]),
    ]);

    const searchButton = node(
      "button",
      {
        class: "primitive-icon-button",
        type: "button",
        title: "Command center — Ctrl+Shift+Space",
        "aria-label": "Open Primitive command center",
        onclick: () => this.openCommand(),
      },
      ["⌕"]
    );
    const closeButton = node(
      "button",
      {
        class: "primitive-icon-button",
        type: "button",
        title: "Close Primitive panel",
        "aria-label": "Close Primitive panel",
        onclick: () => this.closePanel(),
      },
      ["×"]
    );

    const header = node("header", { class: "primitive-panel__header" }, [
      brand,
      searchButton,
      closeButton,
    ]);

    const nav = node(
      "nav",
      { class: "primitive-nav", "aria-label": "Primitive surfaces" },
      SURFACES.map(([id, icon, label]) =>
        node(
          "button",
          {
            class: "primitive-nav-button",
            type: "button",
            dataset: { mode: id, active: this.store.mode === id },
            title: label,
            "aria-label": label,
            onclick: () => this.openSurface(id),
          },
          [
            node("span", { class: "primitive-nav-button__icon", text: icon }),
            node("span", { class: "primitive-nav-button__label", text: label }),
          ]
        )
      )
    );

    this.panelBody = node("div", { class: "primitive-panel__body" });
    this.panel.replaceChildren(header, nav, this.panelBody);
  }

  updatePanelChrome() {
    if (!this.panel) return;
    const subtitle = this.panel.querySelector(".primitive-brand__subtitle");
    if (subtitle) {
      subtitle.textContent = this.currentPage().host || "Browser workspace";
    }
    for (const navButton of this.panel.querySelectorAll(
      ".primitive-nav-button"
    )) {
      navButton.dataset.active = String(navButton.dataset.mode === this.store.mode);
    }
  }

  renderSurface(mode) {
    if (!this.panelBody) return;
    this.store.mode = mode;
    this.updatePanelChrome();

    switch (mode) {
      case "ask":
        this.renderAsk();
        break;
      case "notes":
        this.renderNotes();
        break;
      case "deploy":
        this.renderDeploy();
        break;
      case "flows":
        this.renderFlows();
        break;
      case "canvas":
        this.renderCanvas();
        break;
      case "terminal":
        this.renderTerminal();
        break;
      default:
        this.renderHome();
    }
  }

  pageContextCard() {
    const page = this.currentPage();
    return node("div", { class: "primitive-context" }, [
      node("div", { class: "primitive-context__title", text: page.title }),
      node("div", {
        class: "primitive-context__url",
        text: page.url || "No active web resource",
        title: page.url,
      }),
    ]);
  }

  renderHome() {
    const head = section(
      "Browser workspace",
      "Work from where you are.",
      "Pages, notes, deployment targets, flows and spatial context stay beside the web instead of living in separate apps."
    );
    head.append(this.pageContextCard());

    const quick = section("Quick actions", null, null);
    const cards = node("div", { class: "primitive-grid" });
    const cardData = [
      ["✦", "Ask this page", "Stage with live page context", "ask"],
      ["▤", "Notebook", "Capture pages and working notes", "notes"],
      ["↗", "Deploy", "Targets, environments and releases", "deploy"],
      ["⇢", "Flows", "Automation and integration drafts", "flows"],
      ["◇", "Canvas", "Arrange browser resources spatially", "canvas"],
      ["›_", "Console", "Browser-safe Primitive commands", "terminal"],
    ];
    for (const [icon, title, meta, mode] of cardData) {
      cards.append(
        node(
          "div",
          {
            class: "primitive-card primitive-card--interactive",
            role: "button",
            tabindex: "0",
            onclick: () => this.openSurface(mode),
            onkeydown: event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.openSurface(mode);
              }
            },
          },
          [
            node("div", { class: "primitive-card__icon", text: icon }),
            node("div", { class: "primitive-card__title", text: title }),
            node("div", { class: "primitive-card__meta", text: meta }),
          ]
        )
      );
    }
    quick.append(cards);

    const status = section("Runtime", null, null);
    status.append(
      node("div", { class: "primitive-runtime-card" }, [
        node("div", { class: "primitive-runtime-card__dot" }),
        node("div", {}, [
          node("div", {
            class: "primitive-list-item__title",
            text: "Browser layer active",
          }),
          node("div", {
            class: "primitive-list-item__meta",
            text: "Workspace, AI and deployment execution are intentionally disconnected in this build.",
          }),
        ]),
      ])
    );

    const actions = node("div", { class: "primitive-actions" }, [
      button("Save page", { primary: true, onclick: () => this.saveCurrentPage() }),
      button("Command center", { onclick: () => this.openCommand() }),
      button("Focus web", { ghost: true, onclick: () => this.closePanel() }),
    ]);
    status.append(actions);

    this.panelBody.replaceChildren(head, quick, status);
  }

  renderAsk() {
    const head = section(
      "Contextual AI",
      "Ask with the page attached.",
      "Prompts are stored locally as staged requests until the Primitive runtime is connected. Nothing is presented as an AI response in this browser-only build."
    );
    head.append(this.pageContextCard());

    const prompt = node("textarea", {
      class: "primitive-textarea",
      id: "primitive-ask-input",
      placeholder: "Ask about this page, compare it, extract entities, investigate a claim…",
      "aria-label": "Primitive prompt",
    });
    const actions = node("div", { class: "primitive-actions" }, [
      button("Stage prompt", {
        primary: true,
        onclick: () => {
          const text = prompt.value.trim();
          if (!text) {
            this.notify("Write a prompt first.");
            prompt.focus();
            return;
          }
          const prompts = this.store.read("prompts", []);
          prompts.unshift({
            id: safeId(),
            text,
            context: this.currentPage(),
            status: "awaiting-runtime",
            createdAt: new Date().toISOString(),
          });
          this.store.write("prompts", prompts.slice(0, 50));
          prompt.value = "";
          this.notify("Prompt staged locally — runtime not connected yet.");
          this.renderAsk();
        },
      }),
      button("Save page first", { onclick: () => this.saveCurrentPage() }),
    ]);

    const stagedSection = section("Staged", null, null);
    const prompts = this.store.read("prompts", []).slice(0, 8);
    if (!prompts.length) {
      stagedSection.append(
        node("div", {
          class: "primitive-empty",
          text: "No staged prompts yet. This queue becomes the handoff seam to Primitive Workspace later.",
        })
      );
    } else {
      const list = node("div", { class: "primitive-list" });
      for (const item of prompts) {
        list.append(
          node("div", { class: "primitive-list-item" }, [
            node("div", { class: "primitive-row primitive-row--between" }, [
              node("div", {
                class: "primitive-list-item__title",
                text: shorten(item.text, 58),
              }),
              node("span", {
                class: "primitive-badge",
                text: "not wired",
              }),
            ]),
            node("div", {
              class: "primitive-list-item__meta",
              text: item.context?.host || item.context?.url || "Browser context",
            }),
          ])
        );
      }
      stagedSection.append(list);
    }

    this.panelBody.replaceChildren(head, prompt, actions, stagedSection);
    requestAnimationFrame(() => prompt.focus());
  }

  saveCurrentPage() {
    const page = this.currentPage();
    if (!page.url || page.url === "about:blank") {
      this.notify("There is no page to save yet.");
      return;
    }
    const pages = this.store.read("pages", []);
    const existing = pages.find(item => item.url === page.url);
    if (existing) {
      existing.title = page.title;
      existing.savedAt = new Date().toISOString();
    } else {
      pages.unshift({
        id: safeId(),
        ...page,
        savedAt: new Date().toISOString(),
      });
    }
    this.store.write("pages", pages.slice(0, 250));
    this.notify(existing ? "Saved page refreshed." : "Page added to Primitive notes.");
    if (this.store.mode === "notes" && !this.panel.hidden) {
      this.renderNotes();
    }
  }

  renderNotes() {
    const head = section(
      "Local notebook",
      "Pages and notes without leaving the browser.",
      "This is deliberately local browser state for the UX pass. Workspace persistence will replace the store at integration time."
    );
    head.append(this.pageContextCard());

    const note = node("textarea", {
      class: "primitive-textarea",
      id: "primitive-note-input",
      placeholder: "Write a note about what you are looking at…",
      "aria-label": "New note",
    });
    const noteActions = node("div", { class: "primitive-actions" }, [
      button("Add note", {
        primary: true,
        onclick: () => {
          const text = note.value.trim();
          if (!text) {
            note.focus();
            return;
          }
          const notes = this.store.read("notes", []);
          notes.unshift({
            id: safeId(),
            text,
            context: this.currentPage(),
            createdAt: new Date().toISOString(),
          });
          this.store.write("notes", notes.slice(0, 250));
          this.notify("Note saved locally.");
          this.renderNotes();
        },
      }),
      button("Save current page", { onclick: () => this.saveCurrentPage() }),
    ]);

    const pagesSection = section("Saved pages", null, null);
    const pages = this.store.read("pages", []).slice(0, 20);
    if (!pages.length) {
      pagesSection.append(
        node("div", {
          class: "primitive-empty",
          text: "Save a page and it will appear here as a browser resource.",
        })
      );
    } else {
      const list = node("div", { class: "primitive-list" });
      for (const page of pages) {
        const open = button("Open", {
          ghost: true,
          onclick: () => this.openUrl(page.url),
        });
        const remove = button("Remove", {
          ghost: true,
          onclick: () => {
            this.store.write(
              "pages",
              this.store.read("pages", []).filter(item => item.id !== page.id)
            );
            this.renderNotes();
          },
        });
        list.append(
          node("div", { class: "primitive-list-item" }, [
            node("div", {
              class: "primitive-list-item__title",
              text: page.title,
              title: page.title,
            }),
            node("div", {
              class: "primitive-list-item__meta",
              text: page.url,
              title: page.url,
            }),
            node("div", { class: "primitive-actions" }, [open, remove]),
          ])
        );
      }
      pagesSection.append(list);
    }

    const notesSection = section("Recent notes", null, null);
    const notes = this.store.read("notes", []).slice(0, 12);
    if (notes.length) {
      const list = node("div", { class: "primitive-list" });
      for (const item of notes) {
        list.append(
          node("div", { class: "primitive-list-item" }, [
            node("div", {
              class: "primitive-list-item__title",
              text: shorten(item.text, 70),
            }),
            node("div", {
              class: "primitive-list-item__meta",
              text: item.context?.host || "Standalone note",
            }),
          ])
        );
      }
      notesSection.append(list);
    }

    this.panelBody.replaceChildren(
      head,
      note,
      noteActions,
      pagesSection,
      notesSection
    );
  }

  renderDeploy() {
    const head = section(
      "Delivery",
      "Deployment targets beside the thing you are building.",
      "The interaction model is inspired by self-hosted deployment control planes such as Coolify. This pass stores target configuration only; it does not call a deployment API."
    );

    const status = node("div", { class: "primitive-runtime-card" }, [
      node("div", { class: "primitive-runtime-card__dot" }),
      node("div", {}, [
        node("div", {
          class: "primitive-list-item__title",
          text: "Deployment adapter boundary ready",
        }),
        node("div", {
          class: "primitive-list-item__meta",
          text: "Targets are local drafts until Coolify/Vercel/SSH adapters are explicitly connected.",
        }),
      ]),
    ]);
    head.append(status);

    const formSection = section("Add target", null, null);
    const name = node("input", {
      class: "primitive-field",
      id: "primitive-deploy-name",
      placeholder: "Production",
      "aria-label": "Deployment target name",
    });
    const endpoint = node("input", {
      class: "primitive-field",
      id: "primitive-deploy-endpoint",
      placeholder: "https://coolify.example.com",
      "aria-label": "Deployment endpoint",
    });
    const provider = node("input", {
      class: "primitive-field",
      id: "primitive-deploy-provider",
      placeholder: "Coolify / Vercel / Other",
      "aria-label": "Deployment provider",
    });
    const project = node("input", {
      class: "primitive-field",
      id: "primitive-deploy-project",
      placeholder: "Project / service",
      "aria-label": "Deployment project",
    });
    formSection.append(
      node("div", { class: "primitive-form-grid" }, [name, provider, endpoint, project]),
      node("div", { class: "primitive-actions" }, [
        button("Save target", {
          primary: true,
          onclick: () => {
            const targetName = name.value.trim();
            if (!targetName) {
              name.focus();
              return;
            }
            const targets = this.store.read("deploymentTargets", []);
            targets.unshift({
              id: safeId(),
              name: targetName,
              provider: provider.value.trim() || "Unspecified",
              endpoint: endpoint.value.trim(),
              project: project.value.trim(),
              status: "draft",
              createdAt: new Date().toISOString(),
            });
            this.store.write("deploymentTargets", targets.slice(0, 50));
            this.notify("Deployment target saved as a local draft.");
            this.renderDeploy();
          },
        }),
      ])
    );

    const targetsSection = section("Targets", null, null);
    const targets = this.store.read("deploymentTargets", []);
    if (!targets.length) {
      targetsSection.append(
        node("div", {
          class: "primitive-empty",
          text: "No targets yet. Add your Coolify, Vercel or self-hosted environment above.",
        })
      );
    } else {
      const list = node("div", { class: "primitive-list" });
      for (const target of targets) {
        list.append(
          node("div", { class: "primitive-list-item" }, [
            node("div", { class: "primitive-row primitive-row--between" }, [
              node("div", {
                class: "primitive-list-item__title",
                text: target.name,
              }),
              node("span", { class: "primitive-badge", text: target.status }),
            ]),
            node("div", {
              class: "primitive-list-item__meta",
              text: [target.provider, target.project, target.endpoint]
                .filter(Boolean)
                .join(" · "),
            }),
            node("div", { class: "primitive-actions" }, [
              button("Remove", {
                ghost: true,
                onclick: () => {
                  this.store.write(
                    "deploymentTargets",
                    this.store
                      .read("deploymentTargets", [])
                      .filter(item => item.id !== target.id)
                  );
                  this.renderDeploy();
                },
              }),
            ]),
          ])
        );
      }
      targetsSection.append(list);
    }

    this.panelBody.replaceChildren(head, formSection, targetsSection);
  }

  renderFlows() {
    const head = section(
      "Automation",
      "Draft flows next to the browser context.",
      "This UX borrows the low-friction trigger → action model common to Activepieces/n8n style tools, while keeping execution disconnected until an adapter exists."
    );

    const formSection = section("New flow", null, null);
    const name = node("input", {
      class: "primitive-field",
      id: "primitive-flow-name",
      placeholder: "When I save a page → add it to research",
      "aria-label": "Workflow name",
    });
    const trigger = node("input", {
      class: "primitive-field",
      id: "primitive-flow-trigger",
      placeholder: "Trigger: page saved",
      "aria-label": "Workflow trigger",
    });
    const action = node("input", {
      class: "primitive-field",
      id: "primitive-flow-action",
      placeholder: "Action: capture resource",
      "aria-label": "Workflow action",
    });
    formSection.append(
      name,
      node("div", { class: "primitive-form-grid", style: "margin-top:7px" }, [
        trigger,
        action,
      ]),
      node("div", { class: "primitive-actions" }, [
        button("Create draft", {
          primary: true,
          onclick: () => {
            if (!name.value.trim()) {
              name.focus();
              return;
            }
            const flows = this.store.read("flows", []);
            flows.unshift({
              id: safeId(),
              name: name.value.trim(),
              trigger: trigger.value.trim() || "Manual",
              action: action.value.trim() || "Unconfigured",
              enabled: false,
              createdAt: new Date().toISOString(),
            });
            this.store.write("flows", flows.slice(0, 100));
            this.notify("Workflow draft created.");
            this.renderFlows();
          },
        }),
      ])
    );

    const flowsSection = section("Flows", null, null);
    const flows = this.store.read("flows", []);
    if (!flows.length) {
      flowsSection.append(
        node("div", {
          class: "primitive-empty",
          text: "No workflow drafts yet. Browser events will later become first-class triggers here.",
        })
      );
    } else {
      const list = node("div", { class: "primitive-list" });
      for (const flow of flows) {
        list.append(
          node("div", { class: "primitive-list-item" }, [
            node("div", { class: "primitive-row primitive-row--between" }, [
              node("div", {
                class: "primitive-list-item__title",
                text: flow.name,
              }),
              node("span", {
                class: "primitive-badge",
                text: flow.enabled ? "armed" : "draft",
              }),
            ]),
            node("div", {
              class: "primitive-list-item__meta",
              text: `${flow.trigger} → ${flow.action}`,
            }),
            node("div", { class: "primitive-actions" }, [
              button(flow.enabled ? "Disarm" : "Arm locally", {
                onclick: () => {
                  const next = this.store.read("flows", []);
                  const record = next.find(item => item.id === flow.id);
                  if (record) record.enabled = !record.enabled;
                  this.store.write("flows", next);
                  this.renderFlows();
                },
              }),
              button("Remove", {
                ghost: true,
                onclick: () => {
                  this.store.write(
                    "flows",
                    this.store.read("flows", []).filter(item => item.id !== flow.id)
                  );
                  this.renderFlows();
                },
              }),
            ]),
          ])
        );
      }
      flowsSection.append(list);
    }

    this.panelBody.replaceChildren(head, formSection, flowsSection);
  }

  addCanvasNode(kind, title, url = "") {
    const nodes = this.store.read("canvasNodes", []);
    const index = nodes.length;
    nodes.push({
      id: safeId(),
      kind,
      title: title || "Untitled",
      url,
      x: 18 + (index % 2) * 165,
      y: 20 + Math.floor(index / 2) * 92,
    });
    this.store.write("canvasNodes", nodes.slice(-100));
    this.renderCanvas();
  }

  renderCanvas() {
    const head = section(
      "Spatial workspace",
      "Arrange the browser, not just the tabs.",
      "This lightweight canvas proves the navigation model now. React Flow / Workspace can replace the renderer later without changing the browser surface concept."
    );
    const page = this.currentPage();
    head.append(
      node("div", { class: "primitive-actions" }, [
        button("Add current page", {
          primary: true,
          onclick: () => this.addCanvasNode("web", page.title, page.url),
        }),
        button("Add idea", {
          onclick: () => this.addCanvasNode("idea", "New idea"),
        }),
        button("Clear", {
          ghost: true,
          onclick: () => {
            this.store.write("canvasNodes", []);
            this.renderCanvas();
          },
        }),
      ])
    );

    const canvas = node("div", {
      class: "primitive-canvas",
      id: "primitive-canvas",
      "aria-label": "Primitive spatial canvas",
    });
    const records = this.store.read("canvasNodes", []);
    for (const record of records) {
      const canvasNode = node(
        "div",
        {
          class: "primitive-canvas-node",
          tabindex: "0",
          dataset: { id: record.id },
          style: `left:${Math.max(0, record.x)}px;top:${Math.max(0, record.y)}px`,
          title: record.url || record.title,
        },
        [
          node("div", {
            class: "primitive-canvas-node__kind",
            text: record.kind,
          }),
          node("div", {
            class: "primitive-canvas-node__title",
            text: shorten(record.title, 52),
          }),
        ]
      );

      canvasNode.addEventListener("dblclick", () => {
        if (record.url) this.openUrl(record.url);
      });
      this.bindCanvasDrag(canvasNode, record);
      canvas.append(canvasNode);
    }

    if (!records.length) {
      canvas.append(
        node("div", {
          class: "primitive-empty",
          style: "position:absolute;inset:18px",
          text: "Add the current page or an idea. Drag nodes to arrange them; double-click a web node to reopen it.",
        })
      );
    }

    this.panelBody.replaceChildren(head, canvas);
  }

  bindCanvasDrag(element, record) {
    element.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = record.x;
      const originY = record.y;

      const move = moveEvent => {
        record.x = Math.max(0, originX + moveEvent.clientX - startX);
        record.y = Math.max(0, originY + moveEvent.clientY - startY);
        element.style.left = `${record.x}px`;
        element.style.top = `${record.y}px`;
      };
      const up = upEvent => {
        element.releasePointerCapture(upEvent.pointerId);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", up);
        const records = this.store.read("canvasNodes", []);
        const persisted = records.find(item => item.id === record.id);
        if (persisted) {
          persisted.x = record.x;
          persisted.y = record.y;
          this.store.write("canvasNodes", records);
        }
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", up);
    });
  }

  renderTerminal() {
    const head = section(
      "Browser console",
      "Keyboard-first control without pretending to be a shell.",
      "Commands here operate on the browser and Primitive shell only. OS command execution is explicitly reserved for a later permissioned runtime."
    );
    const output = node("div", {
      class: "primitive-terminal__output",
      id: "primitive-terminal-output",
      text: this.terminalLines.join("\n"),
    });
    const input = node("input", {
      class: "primitive-terminal-input",
      id: "primitive-terminal-input",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "help",
      "aria-label": "Primitive browser command",
    });
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const command = input.value.trim();
      input.value = "";
      this.runTerminalCommand(command);
    });

    const terminal = node("div", { class: "primitive-terminal" }, [
      output,
      node("div", { class: "primitive-terminal__prompt" }, [
        node("span", { class: "primitive-terminal__sigil", text: "primitive ›" }),
        input,
      ]),
    ]);
    this.panelBody.replaceChildren(head, terminal);
    requestAnimationFrame(() => input.focus());
  }

  runTerminalCommand(command) {
    if (!command) return;
    this.terminalLines.push(`primitive › ${command}`);
    const [verb, ...rest] = command.split(/\s+/);
    const argument = rest.join(" ").trim();

    switch (verb.toLowerCase()) {
      case "help":
        this.terminalLines.push(
          "help              show commands",
          "open <url>        open a website or about: page",
          "new               open a new tab",
          "save              save the current page to Notes",
          "panel <surface>   home | ask | notes | deploy | flows | canvas | terminal",
          "url               print the current URL",
          "clear             clear this console",
          "",
          "OS shell execution is not enabled in the browser layer."
        );
        break;
      case "open":
        if (argument) {
          this.terminalLines.push(`Opening ${argument}`);
          this.openUrl(argument);
        } else {
          this.terminalLines.push("Usage: open <url>");
        }
        break;
      case "new":
        this.terminalLines.push("Opening new tab");
        this.newTab();
        break;
      case "save":
        this.saveCurrentPage();
        this.terminalLines.push("Current page saved to local Notes.");
        break;
      case "url":
        this.terminalLines.push(this.currentPage().url || "No current URL");
        break;
      case "panel":
        if (SURFACES.some(([id]) => id === argument)) {
          this.terminalLines.push(`Opening ${argument}`);
          this.openSurface(argument);
          return;
        }
        this.terminalLines.push("Unknown surface.");
        break;
      case "clear":
        this.terminalLines = [];
        break;
      default:
        this.terminalLines.push(
          `Unknown browser command: ${verb}`,
          "This console deliberately does not pass unknown input to an OS shell."
        );
    }
    this.renderTerminal();
  }

  renderCommand() {
    const input = node("input", {
      class: "primitive-command__search",
      id: "primitive-command-input",
      placeholder: "Search, navigate, or command Primitive…",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": "Primitive command center",
    });
    const results = node("div", {
      class: "primitive-command__results",
      id: "primitive-command-results",
      role: "listbox",
    });
    const dialog = node("div", {
      class: "primitive-command__dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Primitive command center",
    });
    dialog.append(
      node("div", { class: "primitive-command__search-wrap" }, [
        node("span", { text: "⌕" }),
        input,
        node("span", { class: "primitive-kbd", text: "Esc" }),
      ]),
      results,
      node("div", { class: "primitive-command__footer" }, [
        node("span", { text: "↑↓ move · Enter run" }),
        node("span", { text: "Primitive Browser" }),
      ])
    );

    this.command.replaceChildren(dialog);
    this.commandInput = input;
    this.commandResults = results;

    input.addEventListener("input", () => {
      this.selectedCommandIndex = 0;
      this.renderCommandResults(input.value);
    });
    input.addEventListener("keydown", event => this.onCommandKeydown(event));
    this.command.addEventListener("mousedown", event => {
      if (event.target === this.command) this.closeCommand();
    });
    this.renderCommandResults("");
  }

  filteredCommands(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.commands;
    return this.commands.filter(command =>
      `${command.group} ${command.title} ${command.detail}`
        .toLowerCase()
        .includes(normalized)
    );
  }

  renderCommandResults(query) {
    if (!this.commandResults) return;
    const commands = this.filteredCommands(query);
    if (this.selectedCommandIndex >= commands.length) {
      this.selectedCommandIndex = Math.max(0, commands.length - 1);
    }
    this.commandResults.replaceChildren();

    if (!commands.length) {
      const value = query.trim();
      if (value && (value.includes(".") || value.includes("://"))) {
        const openItem = this.commandItem(
          {
            group: "Navigate",
            icon: "↗",
            title: `Open ${value}`,
            detail: "Navigate directly",
            run: () => this.openUrl(value),
          },
          0,
          true
        );
        this.commandResults.append(openItem);
      } else {
        this.commandResults.append(
          node("div", {
            class: "primitive-empty",
            text: "No command matches. Type a URL to navigate directly.",
          })
        );
      }
      return;
    }

    let lastGroup = null;
    commands.forEach((command, index) => {
      if (command.group !== lastGroup) {
        this.commandResults.append(
          node("div", {
            class: "primitive-command__group-label",
            text: command.group,
          })
        );
        lastGroup = command.group;
      }
      this.commandResults.append(
        this.commandItem(command, index, index === this.selectedCommandIndex)
      );
    });
  }

  commandItem(command, index, selected) {
    const item = node(
      "button",
      {
        class: "primitive-command__item",
        type: "button",
        role: "option",
        dataset: { selected },
        "aria-selected": String(selected),
        onmouseenter: () => {
          this.selectedCommandIndex = index;
          this.renderCommandResults(this.commandInput?.value || "");
        },
        onclick: () => command.run(),
      },
      [
        node("span", {
          class: "primitive-command__item-icon",
          text: command.icon,
        }),
        node("span", { class: "primitive-command__item-copy" }, [
          node("div", {
            class: "primitive-command__item-title",
            text: command.title,
          }),
          node("div", {
            class: "primitive-command__item-detail",
            text: command.detail,
          }),
        ]),
        command.shortcut
          ? node("span", {
              class: "primitive-command__shortcut",
              text: command.shortcut,
            })
          : null,
      ]
    );
    return item;
  }

  openCommand() {
    this.command.hidden = false;
    this.selectedCommandIndex = 0;
    if (this.commandInput) {
      this.commandInput.value = "";
      this.renderCommandResults("");
      requestAnimationFrame(() => this.commandInput.focus());
    }
  }

  closeCommand() {
    if (this.command) this.command.hidden = true;
  }

  onCommandKeydown(event) {
    const commands = this.filteredCommands(this.commandInput?.value || "");
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedCommandIndex = Math.min(
        this.selectedCommandIndex + 1,
        Math.max(0, commands.length - 1)
      );
      this.renderCommandResults(this.commandInput?.value || "");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
      this.renderCommandResults(this.commandInput?.value || "");
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (commands[this.selectedCommandIndex]) {
        commands[this.selectedCommandIndex].run();
      } else {
        const value = this.commandInput?.value.trim();
        if (value) this.openUrl(value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.closeCommand();
    }
  }

  onKeydown(event) {
    const accel = event.ctrlKey || event.metaKey;
    if (accel && event.shiftKey && event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      this.command.hidden ? this.openCommand() : this.closeCommand();
      return;
    }
    if (accel && event.shiftKey && event.code === "Period") {
      event.preventDefault();
      event.stopPropagation();
      this.togglePanel();
      return;
    }
    if (event.key === "Escape" && !this.command.hidden) {
      event.preventDefault();
      this.closeCommand();
    }
  }

  onTabChange() {
    if (!this.panel?.hidden) {
      this.updatePanelChrome();
      if (["home", "ask", "notes"].includes(this.store.mode)) {
        this.renderSurface(this.store.mode);
      }
    }
  }

  notify(message) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (this.toast) this.toast.hidden = true;
    }, 2600);
  }
}

function initializePrimitiveShell() {
  if (window.gPrimitiveShell) return;
  const shell = new PrimitiveBrowserShell();
  shell.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePrimitiveShell, {
    once: true,
  });
} else {
  initializePrimitiveShell();
}
