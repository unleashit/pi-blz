// Based on @aphotic/pi-flow-ux's border-status editor, stripped to the essentials.
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getConfig } from "./config";
import type { Handle } from "./types";

type BorderFn = (c: string) => string;

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function getTotalUsage(ctx: ExtensionContext): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalCost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const usage = entry.message.usage;
      inputTokens += usage.input;
      outputTokens += usage.output;
      cacheReadTokens += usage.cacheRead ?? 0;
      cacheWriteTokens += usage.cacheWrite ?? 0;
      totalCost += usage.cost?.total ?? 0;
    }
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalCost,
  };
}

export function registerRoundedEditor(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  onReregister: (fn: () => void) => void,
): Handle {
  let gitBranchProvider: (() => string | null) | null = null;
  const getGitBranch = (): string | null => gitBranchProvider?.() ?? null;

  // Render only extension statuses
  ctx.ui.setFooter((_tui, _theme, footerData) => {
    gitBranchProvider = () => footerData.getGitBranch();
    const statuses = footerData.getExtensionStatuses();
    return {
      render(width: number): string[] {
        if (statuses.size === 0) return [];
        const line = [...statuses.values()].join(" ");
        return ["", line];
      },
      invalidate() {},
    };
  });

  function applyEditor() {
    ctx.ui.setEditorComponent((tui, theme, kb) => {
      return new RoundedEditor(tui, theme, kb, ctx, pi, getGitBranch);
    });
  }
  applyEditor();
  onReregister(applyEditor);

  return {
    dispose() {
      ctx.ui.setEditorComponent(undefined);
      ctx.ui.setFooter(undefined);
    },
  };
}

class RoundedEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    kb: KeybindingsManager,
    private ctx: ExtensionContext,
    private pi: ExtensionAPI,
    private getGitBranch: () => string | null,
  ) {
    super(tui, theme, kb, { paddingX: 0 });
  }

  private buildStatusInfo() {
    const modelId = this.ctx.model?.id ?? "?";
    const modelCW = this.ctx.model?.contextWindow
      ? formatTokens(this.ctx.model.contextWindow)
      : "?";
    const usage = this.ctx.getContextUsage();
    const pctValue = usage?.percent ?? null;
    const pct =
      pctValue != null ? `${pctValue.toFixed(1)}%/${modelCW}` : `?%/${modelCW}`;

    // Thinking level indicator (only shown if model supports reasoning effort)
    const rawLevel = this.pi.getThinkingLevel();
    let thinkingLevel: string | null = null;
    if (
      getConfig().roundedEditorShowThinkingLevel &&
      this.ctx.model?.reasoning &&
      rawLevel &&
      rawLevel !== "off"
    ) {
      const map = this.ctx.model.thinkingLevelMap;
      // Show only if model has a thinkingLevelMap and the level isn't explicitly unsupported
      if (map && map[rawLevel] !== null) {
        thinkingLevel = rawLevel;
      }
    }

    let cwd = this.ctx.cwd;
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (home && cwd.startsWith(home)) cwd = `~${cwd.slice(home.length)}`;

    const branch = getConfig().roundedEditorShowBranch
      ? this.getGitBranch()
      : null;
    if (branch) cwd = `${cwd} (${branch})`;

    return { modelId, pct, pctValue, thinkingLevel, cwd };
  }

  private buildTopLine(width: number, cwd: string, border: BorderFn): string {
    const topRight = ` ${border(cwd)} `;
    const topGap = Math.max(1, width - 3 - visibleWidth(topRight));
    return `${border("╭")}${border("─".repeat(topGap))}${topRight}${border("─╮")}`;
  }

  private buildBottomLine(
    width: number,
    modelId: string,
    thinkingLevel: string | null,
    pct: string,
    pctValue: number | null,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number,
    totalCost: number,
    border: BorderFn,
  ): string {
    const theme = this.ctx.ui.theme;
    const parts: string[] = [theme.fg("text", modelId)];

    if (thinkingLevel) {
      parts.push(theme.fg("text", `(${thinkingLevel})`));
    }

    const bottomLeft = ` ${parts.join(" ")} `;

    let coloredPct: string;

    // pi's default behaviour
    if (pctValue !== null && pctValue > 90) {
      coloredPct = theme.fg("error", pct);
    } else if (pctValue !== null && pctValue > 70) {
      coloredPct = theme.fg("warning", pct);
    } else {
      coloredPct = theme.fg("text", pct);
    }

    const stats: string[] = [];

    if (inputTokens > 0) {
      stats.push(theme.fg("accent", `↑${formatTokens(inputTokens)}`));
    }
    if (outputTokens > 0) {
      stats.push(theme.fg("accent", `↓${formatTokens(outputTokens)}`));
    }
    const cfg = getConfig();
    if (cfg.roundedEditorShowCacheTokens && cacheReadTokens > 0) {
      stats.push(theme.fg("accent", `R${formatTokens(cacheReadTokens)}`));
    }
    if (cfg.roundedEditorShowCacheTokens && cacheWriteTokens > 0) {
      stats.push(theme.fg("accent", `W${formatTokens(cacheWriteTokens)}`));
    }
    if (cfg.roundedEditorShowCost && totalCost > 0) {
      stats.push(theme.fg("accent", `$${totalCost.toFixed(1)}`));
    }
    stats.push(coloredPct);

    const bottomRight = ` ${stats.join(" ")} `;
    const bw = visibleWidth(bottomLeft);
    const rw = visibleWidth(bottomRight);
    const botGap = Math.max(1, width - 4 - bw - rw);
    return `${border("╰─")}${bottomLeft}${border("─".repeat(botGap))}${bottomRight}${border("─╯")}`;
  }

  private removeSeparatorLine(lines: string[], innerWidth: number): void {
    const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");
    for (let i = lines.length - 1; i > 0; i--) {
      const stripped = plain(lines[i]!);
      if (
        stripped.startsWith("─") &&
        [...stripped].filter((c) => c === "─").length >= innerWidth / 2
      ) {
        lines.splice(i, 1);
        break;
      }
    }
  }

  private frameInterior(
    lines: string[],
    width: number,
    innerWidth: number,
    border: BorderFn,
  ): void {
    if (width >= 3) {
      const v = border("│");
      for (let i = 1; i < lines.length - 1; i++) {
        const line = lines[i]!;
        const pad = Math.max(0, innerWidth - visibleWidth(line));
        lines[i] = `${v}${line}${" ".repeat(pad)}${v}`;
      }
    }
  }

  override render(width: number): string[] {
    const {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalCost,
    } = getTotalUsage(this.ctx);
    const { modelId, pct, pctValue, thinkingLevel, cwd } =
      this.buildStatusInfo();

    const innerWidth = Math.max(1, width - 2);
    const lines = super.render(innerWidth);
    if (lines.length < 2) return lines;

    const text = this.getText();
    const isBashMode = text.trim().startsWith("!");

    let border: BorderFn;
    if (isBashMode) {
      border = this.ctx.ui.theme.getBashModeBorderColor();
    } else {
      const color = getConfig().roundedEditorColor;
      if (color === "thinking") {
        border = this.ctx.ui.theme.getThinkingBorderColor(
          this.pi.getThinkingLevel() ?? "off",
        );
      } else {
        const theme = this.ctx.ui.theme;
        border = (s: string) => theme.fg(color, s);
      }
    }

    // Top line
    lines[0] = this.buildTopLine(width, cwd, border);

    // Remove separator line when the editor is expanded
    this.removeSeparatorLine(lines, innerWidth);

    // Bottom line
    lines.push(
      this.buildBottomLine(
        width,
        modelId,
        thinkingLevel,
        pct,
        pctValue,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        totalCost,
        border,
      ),
    );

    // Left/right lines
    this.frameInterior(lines, width, innerWidth, border);

    return lines;
  }
}
