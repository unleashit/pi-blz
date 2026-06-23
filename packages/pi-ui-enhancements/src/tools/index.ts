import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Handle } from "../types";
import { patchBashTool } from "./bash";
import { patchLsTool } from "./ls";
import { patchFindTool } from "./find";
import { patchGrepTool } from "./grep";
import { patchReadTool } from "./read";
import { patchWriteTool } from "./write";
import { patchEditTool } from "./edit";

export function patchTools(pi: ExtensionAPI): Handle[] {
  return [
    patchReadTool(pi),
    patchLsTool(pi),
    patchFindTool(pi),
    patchGrepTool(pi),
    patchWriteTool(pi),
    patchBashTool(pi),
    patchEditTool(pi),
  ];
}
