import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAsciiHeader } from "./ascii-header";
import { registerRoundedEditor } from "./rounded-editor";
import { patchTools } from "./tools";
import { patchCustomToolRendering } from "./tools/custom-tool-rendering";
import type { Handle } from "./types";
import { registerWorkingIndicator } from "./working-indicator";

let handles: Handle[] = [];

export default function (pi: ExtensionAPI) {
  const customToolRenderingHandle = patchCustomToolRendering();

  pi.on("session_start", async (_event, ctx) => {
    // Capture tools that were already active (e.g. from other extensions)
    // before we override the list with our built-in set
    const prePatchActive = new Set(pi.getActiveTools());

    handles = patchTools(pi, ctx);
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
        registerAsciiHeader(pi, ctx),
        registerRoundedEditor(pi, ctx),
        registerWorkingIndicator(pi, ctx),
      );
      ctx.ui.setHiddenThinkingLabel("(think)");
    }
  });

  pi.on("session_shutdown", async () => {
    for (const h of handles) {
      h.dispose();
    }
    handles = [];
    customToolRenderingHandle.dispose();
  });
}
