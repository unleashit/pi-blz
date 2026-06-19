import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderResultOptions,
  Theme,
  BashToolDetails,
} from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Handle } from "../types";
import { TOOL_PROMPTS } from "./tool-prompts";
import { registerPatchedTool } from "./tool-registration";
import {
  type BaseRenderState,
  MAX_CALL_WIDTH,
  buildHint,
  countLines,
  extractTextContent,
  formatErrorBody,
  getCallRenderParts,
  getResultSymbolColor,
  getResultText,
  invalidateIfChanged,
  normalizeOutput,
  updateResultState,
} from "./tool-rendering";

type BashToolInput = Parameters<ReturnType<typeof createBashTool>["execute"]>[1];

type BashRenderState = BaseRenderState & {
  startedAt?: number;
  endedAt?: number;
  durationTimer?: ReturnType<typeof setInterval>;
};

type BashDetailsWithTiming = BashToolDetails & {
  durationMs?: number;
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function getOutputWidth(): number {
  // Account for tree prefixes/padding around rendered output lines.
  return Math.max(
    1,
    (process.stdout.columns ?? Number(process.env.COLUMNS) ?? MAX_CALL_WIDTH) -
      6,
  );
}

function formatOutputLines(
  text: string,
  theme: Theme,
  state: BashRenderState,
  color: "toolOutput" | "error" = "toolOutput",
  maxLineWidth?: number,
  closeLastLine = false,
): string {
  const output = normalizeOutput(text);
  if (!output) return "";

  const lines = output.split("\n");
  return lines
    .map((line, index) => {
      const renderedLine =
        maxLineWidth === undefined
          ? line
          : truncateToWidth(line, maxLineWidth, "...");
      const prefix =
        closeLastLine && index === lines.length - 1 ? "└─ " : "│  ";
      return (
        theme.fg(getResultSymbolColor(state), prefix) +
        theme.fg(color, renderedLine)
      );
    })
    .join("\n");
}

function formatBashResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  state: BashRenderState,
  options: ToolRenderResultOptions,
  theme: Theme,
): string {
  const details = result.details as BashDetailsWithTiming | undefined;
  const textContent = extractTextContent(result);

  const hint = buildHint(theme);
  const elapsedMs =
    details?.durationMs ??
    (state.startedAt === undefined
      ? undefined
      : (state.endedAt ?? Date.now()) - state.startedAt);
  const durationSummary =
    elapsedMs === undefined
      ? undefined
      : `${options.isPartial ? "elapsed" : "took"} ${formatDuration(elapsedMs)}`;

  if (state.isError) {
    const errorBody = formatErrorBody(textContent, options);

    if (options.expanded) {
      const summary = durationSummary ? `${durationSummary}, error` : "error";
      const outputLines = formatOutputLines(
        errorBody.text,
        theme,
        state,
        "error",
        undefined,
        true,
      );
      return [
        theme.fg(getResultSymbolColor(state), outputLines ? "├─ " : "└─ ") +
          theme.fg("error", summary),
        outputLines,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    }

    const prefix = durationSummary ? `${durationSummary}, ` : "";
    const suffix = errorBody.truncated ? hint : "";
    return (
      theme.fg(getResultSymbolColor(state), "└─ ") +
      theme.fg("error", `${prefix}${errorBody.text}`) +
      suffix
    );
  }

  const lineCount = countLines(textContent);
  const showExpanded = options.expanded && lineCount > 1;
  const visibleLineCount = showExpanded ? lineCount : Math.min(lineCount, 5);
  const remainingLines = Math.max(0, lineCount - visibleLineCount);

  const parts: string[] = [];
  if (durationSummary) {
    parts.push(theme.fg("muted", durationSummary));
  }
  if (remainingLines > 0) {
    parts.push(
      theme.fg(
        "muted",
        `${remainingLines} more ${remainingLines === 1 ? "line" : "lines"}`,
      ) + hint,
    );
  }
  if (details?.truncation?.truncated) {
    parts.push(theme.fg("warning", "truncated"));
  }

  const summary =
    parts.length > 0
      ? parts.join(theme.fg("muted", ", "))
      : theme.fg("muted", "output");
  const output = showExpanded
    ? normalizeOutput(textContent)
    : normalizeOutput(textContent).split("\n").slice(-5).join("\n");
  const outputLines = formatOutputLines(
    output,
    theme,
    state,
    "toolOutput",
    showExpanded ? undefined : getOutputWidth(),
    true,
  );

  if (lineCount <= 1) {
    const inlineOutput = normalizeOutput(textContent);
    const inlineSummary = [durationSummary, inlineOutput]
      .filter((part): part is string => Boolean(part))
      .join(", ");

    return (
      theme.fg(getResultSymbolColor(state), "└─ ") +
      theme.fg("toolOutput", inlineSummary || summary)
    );
  }

  return [
    theme.fg(getResultSymbolColor(state), outputLines ? "├─ " : "└─ ") +
      summary,
    outputLines,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function patchBashTool(pi: ExtensionAPI, ctx: ExtensionContext): Handle {
  const tool = createBashTool(ctx.cwd);

  return registerPatchedTool({
    pi,
    tool,
    name: "bash",
    label: "bash",
    promptSnippet: TOOL_PROMPTS.bash.promptSnippet,
    async execute(toolCallId, params, signal, onUpdate) {
      const startedAt = Date.now();
      const result = await tool.execute(
        toolCallId,
        params as BashToolInput,
        signal,
        onUpdate,
      );
      const details = (result.details ?? {}) as BashDetailsWithTiming;

      return {
        ...result,
        details: {
          ...details,
          durationMs: Date.now() - startedAt,
        },
      };
    },
    renderCall(args, theme, toolCtx) {
      const state = toolCtx.state as BashRenderState;
      const renderArgs = args as BashToolInput;
      const { text, prefix } = getCallRenderParts(state, theme, toolCtx);

      if (toolCtx.executionStarted && state.startedAt === undefined) {
        state.startedAt = Date.now();
        state.endedAt = undefined;
      }

      let content = prefix;

      const commandDisplay =
        theme.fg("dim", "$ ") +
        theme.bold(theme.fg("accent", renderArgs.command));

      const timeoutSuffix = renderArgs.timeout
        ? theme.fg("muted", ` (timeout ${renderArgs.timeout}s)`)
        : "";

      content += theme.fg("toolTitle", theme.bold("Bash "));
      content += commandDisplay;
      content += timeoutSuffix;

      text.setText(content);
      return text;
    },
    renderResult(result, options, theme, toolCtx) {
      const state = toolCtx.state as BashRenderState;
      const text = getResultText(state, options, toolCtx.lastComponent);

      const details = result.details as BashToolDetails | undefined;

      if (
        state.startedAt !== undefined &&
        options.isPartial &&
        !state.durationTimer
      ) {
        state.durationTimer = setInterval(() => toolCtx.invalidate(), 1000);
      }

      if (!options.isPartial || toolCtx.isError) {
        state.endedAt ??= Date.now();
        if (state.durationTimer) {
          clearInterval(state.durationTimer);
          state.durationTimer = undefined;
        }
      }

      const changed = updateResultState(state, {
        truncated: details?.truncation?.truncated === true,
        isError: toolCtx.isError,
      });

      invalidateIfChanged(changed, toolCtx.invalidate);
      text.setText(formatBashResult(result, state, options, theme));

      return text;
    },
  });
}
