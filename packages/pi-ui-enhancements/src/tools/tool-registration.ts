import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Handle } from "../types";
import { clearBlinkTimers } from "./tool-rendering";

type ToolRegistration = Parameters<ExtensionAPI["registerTool"]>[0];

type BaseTool = {
  description: ToolRegistration["description"];
  parameters: ToolRegistration["parameters"];
  execute: NonNullable<ToolRegistration["execute"]>;
};

export function registerPatchedTool(config: {
  pi: ExtensionAPI;
  tool: BaseTool;
  name: ToolRegistration["name"];
  label: ToolRegistration["label"];
  promptSnippet: NonNullable<ToolRegistration["promptSnippet"]>;
  promptGuidelines?: ToolRegistration["promptGuidelines"];
  execute?: ToolRegistration["execute"];
  renderCall: NonNullable<ToolRegistration["renderCall"]>;
  renderResult: NonNullable<ToolRegistration["renderResult"]>;
}): Handle {
  config.pi.registerTool({
    name: config.name,
    label: config.label,
    description: config.tool.description,
    promptSnippet: config.promptSnippet,
    promptGuidelines: config.promptGuidelines,
    parameters: config.tool.parameters,
    renderShell: "self",
    execute: config.execute ?? config.tool.execute,
    renderCall: config.renderCall,
    renderResult: config.renderResult,
  });

  return {
    dispose() {
      clearBlinkTimers();
    },
  };
}
