import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerRoundedEditor } from "./rounded-editor";
import { registerWorkingIndicator } from "./working-indicator";
import type { Handle } from "./types";

let handles: Handle[] = [];

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      handles = [
        registerRoundedEditor(pi, ctx),
        registerWorkingIndicator(pi, ctx),
      ];
    }
  });

  pi.on("session_shutdown", async () => {
    for (const h of handles) {
      h.dispose();
    }
    handles = [];
  });
}
