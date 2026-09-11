// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Registers Primitive as a real Firefox customizable toolbar widget. The core
// shell's direct button is retained only as a bootstrap fallback and is removed
// here once CustomizableUI is available.

const WIDGET_ID = "primitive-toolbar-button";

function customizableUI() {
  try {
    const module = ChromeUtils.importESModule(
      "resource:///modules/CustomizableUI.sys.mjs"
    );
    return module.CustomizableUI || module.default || null;
  } catch (error) {
    console.warn("[Primitive] CustomizableUI module unavailable", error);
    return null;
  }
}

function registerPrimitiveWidget() {
  const CustomizableUI = customizableUI();
  if (!CustomizableUI) {
    return;
  }

  // PrimitiveShell installs a conservative fallback before this integration
  // runs. Remove only that DOM node; CustomizableUI owns the final instance.
  document.getElementById(WIDGET_ID)?.remove();

  try {
    if (!CustomizableUI.getWidget(WIDGET_ID)) {
      CustomizableUI.createWidget({
        id: WIDGET_ID,
        type: "button",
        defaultArea: CustomizableUI.AREA_NAVBAR,
        removable: true,
        label: "Primitive",
        tooltiptext: "Primitive — browser workspace",
        onCommand(event) {
          const targetWindow = event?.view || window;
          targetWindow.gPrimitiveShell?.togglePanel();
        },
      });
    }
  } catch (error) {
    console.error("[Primitive] Could not register toolbar widget", error);
    window.gPrimitiveShell?.notify(
      "Primitive toolbar registration failed; keyboard shortcuts still work."
    );
    return;
  }

  try {
    const widget = CustomizableUI.getWidget(WIDGET_ID)?.forWindow?.(window);
    const widgetNode = widget?.node;
    if (widgetNode) {
      widgetNode.setAttribute(
        "image",
        "chrome://browser/content/primitive/assets/primitive-mark.svg"
      );
      widgetNode.setAttribute("aria-label", "Open Primitive browser workspace");
    }
  } catch (error) {
    console.warn("[Primitive] Toolbar widget node not available yet", error);
  }
}

function initializeToolbar(attempt = 0) {
  if (!window.gPrimitiveShell) {
    if (attempt < 120) {
      requestAnimationFrame(() => initializeToolbar(attempt + 1));
    }
    return;
  }
  registerPrimitiveWidget();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeToolbar(), {
    once: true,
  });
} else {
  initializeToolbar();
}
