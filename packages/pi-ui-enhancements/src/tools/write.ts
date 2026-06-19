import {
  createWriteTool,
  Theme,
  highlightCode,
  getLanguageFromPath,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolRenderResultOptions,
  type WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  buildHint,
  countLines,
  extractTextContent,
  formatSimpleErrorResult,
  getCallRenderParts,
  getResultSymbolColor,
  getResultText,
  invalidateIfChanged,
  MAX_CALL_WIDTH,
  renderPath,
  updateResultState,
  type BaseRenderState,
} from "./tool-rendering";
import type { Handle } from "../types";
import { TOOL_PROMPTS } from "./tool-prompts";
import { registerPatchedTool } from "./tool-registration";

function formatWriteResult(
  result: { content: Array<{ type: string; text?: string }> },
  state: BaseRenderState,
  options: ToolRenderResultOptions,
  theme: Theme,
  args: WriteToolInput,
): string {
  const textContent = extractTextContent(result);

  const hint = buildHint(theme);

  if (state.isError) {
    return formatSimpleErrorResult(textContent, state, options, theme);
  }

  const lines = countLines(args.content);
  const summary = `${lines} ${lines === 1 ? "line" : "lines"}`;

  if (options.expanded) {
    const lang = getLanguageFromPath(args.path);

    let expanded = "";

    const previewLines = args.content.split("\n").slice(0, 20);
    expanded += highlightCode(previewLines.join("\n"), lang).join("\n");
    if (lines > 20) {
      expanded += "\n" + theme.fg("muted", `${lines - 20} more lines`);
    }
    return expanded;
  }

  return (
    theme.fg(getResultSymbolColor(state), "└─ ") +
    theme.fg("toolOutput", summary) +
    hint
  );
}

export function patchWriteTool(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Handle {
  const tool = createWriteTool(ctx.cwd);

  return registerPatchedTool({
    pi,
    tool,
    name: "write",
    label: "write",
    promptSnippet: TOOL_PROMPTS.write.promptSnippet,
    promptGuidelines: [...TOOL_PROMPTS.write.promptGuidelines],
    renderCall(args, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const renderArgs = args as WriteToolInput;
      const { text, prefix } = getCallRenderParts(state, theme, toolCtx);

      let callLine = prefix;

      callLine += theme.fg("toolTitle", theme.bold("Write "));
      callLine += renderPath(renderArgs.path, theme, toolCtx.cwd);

      let content = truncateToWidth(callLine, MAX_CALL_WIDTH);
      if (toolCtx.isPartial && typeof renderArgs.content === "string") {
        content +=
          "\n" +
          formatWriteResult(
            { content: [] },
            state,
            { expanded: toolCtx.expanded, isPartial: toolCtx.isPartial },
            theme,
            renderArgs,
          )
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n");
      }

      text.setText(content);
      return text;
    },
    renderResult(result, options, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const text = getResultText(state, options, toolCtx.lastComponent);

      const details = result.details as
        | { truncation?: { truncated?: boolean } }
        | undefined;
      const changed = updateResultState(state, {
        truncated: details?.truncation?.truncated === true,
        isError: toolCtx.isError,
      });

      invalidateIfChanged(changed, toolCtx.invalidate);

      const writeArgs = toolCtx.args as WriteToolInput;
      text.setText(formatWriteResult(result, state, options, theme, writeArgs));

      return text;
    },
  });
}
