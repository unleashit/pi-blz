import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAsciiHeader } from "./ascii-header";
import { registerRoundedEditor } from "./rounded-editor";
import { patchTools } from "./tools";
import { patchCustomToolRendering } from "./tools/custom-tool-rendering";
import type { Handle } from "./types";
import { registerWorkingIndicator } from "./working-indicator";
import { getConfig, loadConfig, setOnConfigChange } from "./config";
import { registerConfigCommand } from "./settings-command";

let handles: Handle[] = [];

export default function (pi: ExtensionAPI) {
  handles = patchTools(pi);
  loadConfig();
  let customToolRenderingHandle: Handle | null = getConfig().patchCustomTools
    ? patchCustomToolRendering()
    : null;

  let headerReregister: (() => void) | null = null;
  let editorReregister: (() => void) | null = null;
  let settingsUiActive = false;

  setOnConfigChange(() => {
    headerReregister?.();
    if (!settingsUiActive) {
      editorReregister?.();
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    // Reset in case settings UI was force-closed last session
    settingsUiActive = false;
    loadConfig((err) => {
      ctx.ui.notify(
        `Config load failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    });

    // Apply config changes made before session start while keeping the patch early
    // enough for history rendering after /reload
    if (getConfig().patchCustomTools && !customToolRenderingHandle) {
      customToolRenderingHandle = patchCustomToolRendering();
    } else if (!getConfig().patchCustomTools && customToolRenderingHandle) {
      customToolRenderingHandle.dispose();
      customToolRenderingHandle = null;
    }

    // Capture tools that were already active (e.g. from other extensions)
    // before we override the list with our built-in set
    const prePatchActive = new Set(pi.getActiveTools());

    const builtInTools = [
      "read",
      "write",
      "edit",
      "bash",
      "ls",
      "find",
      "grep",
    ];
    const allActive = [...new Set([...builtInTools, ...prePatchActive])];
    pi.setActiveTools(allActive);

    if (ctx.hasUI) {
      handles.push(
        registerAsciiHeader(pi, ctx, (fn) => {
          headerReregister = fn;
        }),
        registerRoundedEditor(pi, ctx, (fn) => {
          editorReregister = fn;
        }),
        registerWorkingIndicator(pi, ctx),
      );
      registerConfigCommand(
        pi,
        () => { settingsUiActive = true; },
        () => { settingsUiActive = false; },
      );
      ctx.ui.setHiddenThinkingLabel("(think)");
    }
  });

  pi.on("session_shutdown", async () => {
    for (const h of handles) {
      h.dispose();
    }
    handles = [];
    customToolRenderingHandle?.dispose();
    customToolRenderingHandle = null;
  });
}
