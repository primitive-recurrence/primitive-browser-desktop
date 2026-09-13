// Primitive Browser context capture.
// Adds browser-native context menu affordances without requiring Workspace or
// a WebExtension. Selection text is sourced from Firefox's existing parent-side
// context-menu state, avoiding a new cross-process protocol for this UX pass.

const MENU_ID = "primitive-context-menu";
const SEPARATOR_ID = "primitive-context-separator";

function contextSelection() {
  const menu = window.gContextMenu;
  if (!menu) {
    return "";
  }
  return (
    menu.selectionInfo?.text ||
    menu.selectionInfo?.fullText ||
    menu.textSelected ||
    ""
  ).trim();
}

function currentLink() {
  const menu = window.gContextMenu;
  return menu?.linkURL || menu?.linkURI?.spec || "";
}

function createMenuItem(label, action, id) {
  const item = document.createXULElement("menuitem");
  item.id = id;
  item.setAttribute("label", label);
  item.addEventListener("command", action);
  return item;
}

function saveSelection() {
  const shell = window.gPrimitiveShell;
  const text = contextSelection();
  if (!shell || !text) {
    shell?.notify("Select some text first.");
    return;
  }
  const notes = shell.store.read("notes", []);
  notes.unshift({
    id: `selection-${Date.now().toString(36)}`,
    text,
    context: shell.currentPage(),
    kind: "selection",
    createdAt: new Date().toISOString(),
  });
  shell.store.write("notes", notes.slice(0, 250));
  shell.notify("Selection saved to Primitive Notes.");
}

function askAboutSelection() {
  const shell = window.gPrimitiveShell;
  const text = contextSelection();
  if (!shell) {
    return;
  }
  shell.openSurface("ask");
  requestAnimationFrame(() => {
    const input = document.getElementById("primitive-ask-input");
    if (!input) {
      return;
    }
    input.value = text
      ? `Regarding this selection:\n\n“${text}”\n\n`
      : "Regarding the current page:\n\n";
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function saveLink() {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    return;
  }
  const url = currentLink();
  if (!url) {
    shell.notify("No link is selected.");
    return;
  }
  const pages = shell.store.read("pages", []);
  if (!pages.some(item => item.url === url)) {
    pages.unshift({
      id: `link-${Date.now().toString(36)}`,
      title: window.gContextMenu?.linkTextStr || url,
      url,
      host: (() => {
        try {
          return new URL(url).host;
        } catch (_) {
          return "";
        }
      })(),
      kind: "link",
      sourcePage: shell.currentPage(),
      savedAt: new Date().toISOString(),
    });
    shell.store.write("pages", pages.slice(0, 250));
  }
  shell.notify("Link saved to Primitive Notes.");
}

function addCurrentPageToCanvas() {
  const shell = window.gPrimitiveShell;
  if (!shell) {
    return;
  }
  const page = shell.currentPage();
  shell.addCanvasNode("web", page.title, page.url);
  shell.notify("Page added to Primitive Canvas.");
}

function installContextMenu() {
  if (document.getElementById(MENU_ID)) {
    return;
  }
  const contextMenu = document.getElementById("contentAreaContextMenu");
  if (!contextMenu) {
    console.warn("[Primitive] Firefox content context menu not found");
    return;
  }

  const separator = document.createXULElement("menuseparator");
  separator.id = SEPARATOR_ID;

  const menu = document.createXULElement("menu");
  menu.id = MENU_ID;
  menu.setAttribute("label", "Primitive");
  menu.setAttribute("accesskey", "P");

  const popup = document.createXULElement("menupopup");
  const ask = createMenuItem(
    "Ask Primitive about selection",
    askAboutSelection,
    "primitive-context-ask"
  );
  const save = createMenuItem(
    "Save selection to Notes",
    saveSelection,
    "primitive-context-save-selection"
  );
  const savePage = createMenuItem(
    "Save page to Notes",
    () => window.gPrimitiveShell?.saveCurrentPage(),
    "primitive-context-save-page"
  );
  const saveLinkItem = createMenuItem(
    "Save link to Notes",
    saveLink,
    "primitive-context-save-link"
  );
  const canvas = createMenuItem(
    "Add page to Canvas",
    addCurrentPageToCanvas,
    "primitive-context-canvas"
  );
  const openButton = createMenuItem(
    "Open Primitive panel",
    () => window.gPrimitiveShell?.openSurface("home"),
    "primitive-context-open"
  );

  popup.append(
    ask,
    save,
    document.createXULElement("menuseparator"),
    savePage,
    saveLinkItem,
    canvas,
    document.createXULElement("menuseparator"),
    openButton
  );
  menu.append(popup);
  contextMenu.append(separator, menu);

  contextMenu.addEventListener("popupshowing", () => {
    const selection = contextSelection();
    const link = currentLink();
    ask.setAttribute(
      "label",
      selection
        ? "Ask Primitive about selection"
        : "Ask Primitive about this page"
    );
    save.hidden = !selection;
    saveLinkItem.hidden = !link;
  });
}

function initializeCapture() {
  if (!window.gPrimitiveShell) {
    window.addEventListener(
      "load",
      () => requestAnimationFrame(installContextMenu),
      { once: true }
    );
    return;
  }
  installContextMenu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCapture, {
    once: true,
  });
} else {
  initializeCapture();
}
