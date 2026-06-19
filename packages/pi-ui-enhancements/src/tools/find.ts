import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderResultOptions,
  FindToolDetails,
  Theme,
  FindToolInput,
} from "@earendil-works/pi-coding-agent";
import { createFindTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Handle } from "../types";
import { TOOL_PROMPTS } from "./tool-prompts";
import { registerPatchedTool } from "./tool-registration";
import {
  type BaseRenderState,
  MAX_CALL_WIDTH,
  MAX_EXPANDED_ENTRIES,
  buildHint,
  extractTextContent,
  formatSimpleErrorResult,
  formatTreeLine,
  getCallRenderParts,
  getResultSymbolColor,
  getResultText,
  invalidateIfChanged,
  normalizeOutput,
  renderPath,
  updateResultState,
} from "./tool-rendering";

function formatFindResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  state: BaseRenderState,
  options: ToolRenderResultOptions,
  theme: Theme,
): string {
  const details = result.details as FindToolDetails | undefined;
  const textContent = extractTextContent(result);

  if (state.isError) {
    return formatSimpleErrorResult(textContent, state, options, theme);
  }

  const hint = buildHint(theme);

  const normalized = normalizeOutput(textContent);
  if (normalized === "" || normalized === "No files found matching pattern") {
    return (
      theme.fg(getResultSymbolColor(state), "└─ ") +
      theme.fg("muted", "(no matches found)")
    );
  }

  // Strip trailing notice block appended by the find tool, e.g.
  // "\n\n[1000 results limit reached. Use limit=2000 for more, or refine pattern]"
  const body = normalized.includes("\n\n[")
    ? normalized.slice(0, normalized.lastIndexOf("\n\n["))
    : normalized;

  const files = body.split("\n").filter((f) => f.length > 0);
  const totalFiles = files.length;

  const summaryParts: string[] = [];
  summaryParts.push(`${totalFiles} ${totalFiles === 1 ? "file" : "files"}`);

  if (details?.resultLimitReached !== undefined) {
    summaryParts.push(
      theme.fg("warning", `${details.resultLimitReached} limit`),
    );
  }
  if (details?.truncation?.truncated) {
    summaryParts.push(theme.fg("warning", "truncated"));
  }

  const summary = summaryParts.join(theme.fg("toolOutput", ", "));

  if (!options.expanded) {
    return (
      theme.fg(getResultSymbolColor(state), "└─ ") +
      theme.fg("toolOutput", summary) +
      hint
    );
  }

  const visibleFiles = files.slice(0, MAX_EXPANDED_ENTRIES);
  const remaining = Math.max(0, totalFiles - MAX_EXPANDED_ENTRIES);

  const lines: string[] = [];

  lines.push(
    theme.fg(getResultSymbolColor(state), "├─ ") +
      theme.fg("toolOutput", summary),
  );

  visibleFiles.forEach((file, index) => {
    const isLastVisible = index === visibleFiles.length - 1 && remaining === 0;
    const prefix: "│  " | "└─ " = isLastVisible ? "└─ " : "│  ";

    const treeLine = formatTreeLine(file, {
      theme,
      state,
      prefix,
      width: MAX_CALL_WIDTH - 1,
      mode: "preserve",
    });
    lines.push(treeLine.text);
  });

  if (remaining > 0) {
    lines.push(
      theme.fg(getResultSymbolColor(state), "└─ ") +
        theme.fg("muted", `${remaining} more files`),
    );
  }

  return lines.join("\n");
}

export function patchFindTool(pi: ExtensionAPI, ctx: ExtensionContext): Handle {
  const tool = createFindTool(ctx.cwd);

  return registerPatchedTool({
    pi,
    tool,
    name: "find",
    label: "find",
    promptSnippet: TOOL_PROMPTS.find.promptSnippet,
    renderCall(args, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const { text, prefix } = getCallRenderParts(state, theme, toolCtx);

      let content = prefix;

      const renderArgs = args as FindToolInput;
      const title = theme.fg("toolTitle", theme.bold("Find "));
      const pattern = theme.fg("success", renderArgs.pattern);
      const limit = renderArgs.limit
        ? theme.fg("muted", ` (limit ${renderArgs.limit})`)
        : "";
      const pathPrefix = renderArgs.path ? " in " : "";
      const pathDisplay = renderArgs.path
        ? `${pathPrefix}${renderPath(
            renderArgs.path,
            theme,
            toolCtx.cwd,
            Math.max(
              1,
              MAX_CALL_WIDTH -
                visibleWidth(content + title + pattern + pathPrefix + limit),
            ),
          )}`
        : "";

      content += title;
      content += pattern;
      content += pathDisplay;
      content += limit;

      text.setText(
        truncateToWidth(content, MAX_CALL_WIDTH, theme.fg("accent", "...")),
      );
      return text;
    },
    renderResult(result, options, theme, toolCtx) {
      const state = toolCtx.state as BaseRenderState;
      const text = getResultText(state, options, toolCtx.lastComponent);

      const details = result.details as FindToolDetails | undefined;

      const changed = updateResultState(state, {
        truncated: details?.truncation?.truncated === true,
        isError: toolCtx.isError,
      });

      invalidateIfChanged(changed, toolCtx.invalidate);

      text.setText(formatFindResult(result, state, options, theme));
      return text;
    },
  });
}
