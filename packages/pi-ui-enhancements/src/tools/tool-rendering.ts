import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  keyHint,
  Theme,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  hyperlink,
  visibleWidth,
  Text,
} from "@earendil-works/pi-tui";

export type BaseRenderState = {
  blinkTimer?: ReturnType<typeof setInterval>;
  hasResult?: boolean;
  truncated?: boolean;
  isError?: boolean;
  expanded?: boolean;
};

export const MAX_CALL_WIDTH = 120;

const BLINK_INTERVAL_MS = 500;
const activeBlinkTimers = new Set<ReturnType<typeof setInterval>>();

export function isBlinkOn(): boolean {
  return Math.floor(Date.now() / BLINK_INTERVAL_MS) % 2 === 0;
}

export function getStatusSymbol(isDone: boolean): string {
  if (isDone) return "●";
  return isBlinkOn() ? "●" : "○";
}

export function getResultSymbolColor(
  state: BaseRenderState,
): "dim" | "warning" | "error" {
  if (state.isError) return "error";
  if (state.truncated) return "warning";
  return "dim";
}

export function getStatusColor(
  isDone: boolean,
  state: BaseRenderState,
): "success" | "warning" | "error" | "dim" {
  if (state.isError) return "error";
  if (state.truncated) return "warning";

  if (!isDone) return isBlinkOn() ? "success" : "dim";
  return "success";
}

function shortenPath(filePath: string): string {
  const home = homedir();
  return filePath.startsWith(home)
    ? `~${filePath.slice(home.length)}`
    : filePath;
}

export function renderPath(
  rawPath: unknown,
  theme: Theme,
  cwd: string,
): string {
  if (rawPath == null || rawPath === "") return theme.fg("toolOutput", "...");
  if (typeof rawPath !== "string") return theme.fg("error", "[invalid arg]");

  const styled = theme.fg("accent", shortenPath(rawPath));
  if (!getCapabilities().hyperlinks) return styled;

  const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  return hyperlink(styled, pathToFileURL(absolutePath).href);
}

export function updateBlinkTimer(
  state: BaseRenderState,
  shouldBlink: boolean,
  invalidate: () => void,
): void {
  if (shouldBlink && !state.blinkTimer) {
    state.blinkTimer = setInterval(invalidate, BLINK_INTERVAL_MS);
    activeBlinkTimers.add(state.blinkTimer);
    return;
  }

  if (!shouldBlink && state.blinkTimer) {
    clearInterval(state.blinkTimer);
    activeBlinkTimers.delete(state.blinkTimer);
    state.blinkTimer = undefined;
  }
}

export function clearBlinkTimers(): void {
  for (const timer of activeBlinkTimers) {
    clearInterval(timer);
  }
  activeBlinkTimers.clear();
}

export function buildHint(theme: Theme): string {
  return (
    theme.fg("muted", " (") +
    keyHint("app.tools.expand", "to expand") +
    theme.fg("muted", ")")
  );
}

export function normalizeOutput(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export function countLines(text: string): number {
  const trimmed = normalizeOutput(text);
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}

export function extractTextContent(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text ?? "")
    .join("\n");
}

export function getMaxErrorLineWidth(): number {
  return Math.floor(
    (process.stdout.columns ?? Number(process.env.COLUMNS) ?? MAX_CALL_WIDTH) /
      2,
  );
}

export function formatErrorBody(
  textContent: string,
  options: ToolRenderResultOptions,
): { text: string; isSingleLine: boolean; truncated: boolean } {
  const output = normalizeOutput(textContent);
  const lines = output.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end--;
  }
  const trimmed = lines.slice(0, end);

  if (options.expanded) {
    return {
      text: trimmed.join("\n"),
      isSingleLine: trimmed.length <= 1,
      truncated: false,
    };
  }

  const maxLineWidth = getMaxErrorLineWidth();
  const joined = trimmed.join("\n");

  if (trimmed.length === 1 && visibleWidth(joined) <= maxLineWidth) {
    return { text: joined, isSingleLine: true, truncated: false };
  }

  const truncated = joined.slice(0, maxLineWidth - 3);
  return { text: `${truncated}...`, isSingleLine: true, truncated: true };
}

export function formatSimpleErrorResult(
  textContent: string,
  state: BaseRenderState,
  options: ToolRenderResultOptions,
  theme: Theme,
): string {
  const errorBody = formatErrorBody(textContent, options);

  if (options.expanded) {
    return theme.fg("error", errorBody.text);
  }

  const suffix = errorBody.truncated ? buildHint(theme) : "";
  return (
    theme.fg(getResultSymbolColor(state), "└─ ") +
    theme.fg("error", errorBody.text) +
    suffix
  );
}

export function getCallRenderParts(
  state: BaseRenderState,
  theme: Theme,
  toolCtx: {
    lastComponent?: unknown;
    executionStarted?: boolean;
    isPartial?: boolean;
    invalidate: () => void;
  },
): { text: Text; prefix: string; isDone: boolean } {
  const text =
    (toolCtx.lastComponent as Text | undefined) ?? new Text("", 1, 0);

  const isDone =
    state.hasResult || (!toolCtx.executionStarted && !toolCtx.isPartial);

  updateBlinkTimer(state, !isDone, toolCtx.invalidate);

  const prefix = theme.fg(
    getStatusColor(isDone, state),
    `${getStatusSymbol(isDone)} `,
  );

  return { text, prefix, isDone };
}

export function getResultText(
  state: BaseRenderState,
  options: ToolRenderResultOptions,
  lastComponent: unknown,
): Text {
  const paddingX = options.expanded ? 3 : 1;
  const text =
    state.expanded !== options.expanded
      ? new Text("", paddingX, 0)
      : ((lastComponent as Text | undefined) ?? new Text("", paddingX, 0));

  state.expanded = options.expanded;
  return text;
}

export function updateResultState(
  state: BaseRenderState,
  next: {
    hasResult?: boolean;
    truncated?: boolean;
    isError?: boolean;
  },
): boolean {
  const nextHasResult = next.hasResult ?? true;
  const nextTruncated = next.truncated ?? false;
  const nextIsError = next.isError ?? false;

  const changed =
    state.hasResult !== nextHasResult ||
    state.truncated !== nextTruncated ||
    state.isError !== nextIsError;

  state.hasResult = nextHasResult;
  state.truncated = nextTruncated;
  state.isError = nextIsError;

  return changed;
}

export function invalidateIfChanged(
  changed: boolean,
  invalidate: () => void,
): void {
  if (changed) {
    queueMicrotask(invalidate);
  }
}
