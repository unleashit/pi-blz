import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderResultOptions,
  ReadToolDetails,
  Theme,
  ReadToolInput,
} from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Handle } from "../types";
import { TOOL_PROMPTS } from "./tool-prompts";
import { registerPatchedTool } from "./tool-registration";
import {
  type BaseRenderState,
  MAX_CALL_WIDTH,
  countLines,
  extractTextContent,
  formatSimpleErrorResult,
  getCallRenderParts,
  getResultSymbolColor,
  getResultText,
  invalidateIfChanged,
  renderPath,
  updateResultState,
} from "./tool-rendering";

function formatReadLineRange(
  args: ReadToolInput | undefined,
  theme: Theme,
): string {
  if (args?.offset === undefined && args?.limit === undefined) return "";
  const startLine = args.offset ?? 1;
  const endLine = args.limit !== undefined ? startLine + args.limit - 1 : "";
  return theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
}

function formatReadResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  state: BaseRenderState,
  options: ToolRenderResultOptions,
  theme: Theme,
): string {
  const details = result.details as ReadToolDetails | undefined;
  const hasImage = result.content.some((c) => c.type === "image");
  const textContent = extractTextContent(result);

  if (state.isError) {
    return formatSimpleErrorResult(textContent, state, options, theme);
  }

  const parts: string[] = [];
  if (textContent && !hasImage) {
    const lines = countLines(textContent);
    parts.push(`${lines} ${lines === 1 ? "line" : "lines"}`);
  }
  if (hasImage) {
    const match = textContent.match(/original\s+(\d+)x(\d+)/);
    if (match) {
      parts.push(`Image (${match[1]}x${match[2]})`);
    } else {
      parts.push("Image");
    }
  }
  if (details?.truncation?.truncated) {
    parts.push("truncated");
  }

  const summary = parts.length > 0 ? parts.join(", ") : "no content";

  return (
    theme.fg(getResultSymbolColor(state), "└─ ") +
    theme.fg("toolOutput", summary)
  );
}

export function patchReadTool(pi: ExtensionAPI, ctx: ExtensionContext): Handle {
  const tool = createReadTool(ctx.cwd);

  return registerPatchedTool({
    pi,
    tool,
    name: "read",
    label: "read",
    promptSnippet: TOOL_PROMPTS.read.promptSnippet,
    promptGuidelines: [...TOOL_PROMPTS.read.promptGuidelines],
    renderCall(args, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const { text, prefix } = getCallRenderParts(state, theme, toolCtx);

      let content = prefix;

      const renderArgs = args as ReadToolInput;
      const pathDisplay = renderPath(renderArgs.path, theme, toolCtx.cwd);

      content += theme.fg("toolTitle", theme.bold("Read "));
      content += pathDisplay;
      content += formatReadLineRange(renderArgs, theme);

      text.setText(truncateToWidth(content, MAX_CALL_WIDTH));
      return text;
    },
    renderResult(result, options, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const text = getResultText(state, options, toolCtx.lastComponent);

      const details = result.details as ReadToolDetails | undefined;

      const changed = updateResultState(state, {
        truncated: details?.truncation?.truncated === true,
        isError: toolCtx.isError,
      });

      invalidateIfChanged(changed, toolCtx.invalidate);

      text.setText(formatReadResult(result, state, options, theme));
      return text;
    },
  });
}
