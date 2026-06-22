import {
  VERSION,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import figlet from "figlet";
import type { Handle } from "./types";

export interface AsciiHeaderConfig {
  text: string;
  font: string;
  align: "left" | "center" | "right";
}

export function loadAsciiHeaderConfig(): AsciiHeaderConfig {
  return {
    text: "pi",
    font: "Larry 3D 2",
    align: "center",
  };
}

export interface AsciiHeaderData {
  rawLines: string[];
  rawLineWidths: number[];
  versionWidth: number;
}

export function buildAsciiHeaderData(
  config: AsciiHeaderConfig,
): AsciiHeaderData {
  const rawLines = figlet
    .textSync(config.text, { font: config.font })
    .split("\n");
  return {
    rawLines,
    rawLineWidths: rawLines.map((line) => visibleWidth(line)),
    versionWidth: visibleWidth(`v${VERSION}`),
  };
}

function padLine(
  styled: string,
  rawWidth: number,
  width: number,
  align: string,
) {
  if (align === "left") return " " + styled;
  const pad =
    align === "center"
      ? Math.max(0, Math.floor((width - rawWidth) / 2))
      : Math.max(1, width - rawWidth - 1);
  return " ".repeat(pad) + styled;
}

export function buildAsciiHeader(
  theme: Theme,
  width: number,
  config: AsciiHeaderConfig,
  data: AsciiHeaderData,
): string[] {
  return [
    "",
    ...data.rawLines.map((line, i) =>
      padLine(
        theme.fg("accent", line),
        data.rawLineWidths[i]!,
        width,
        config.align,
      ),
    ),
    "",
    padLine(
      theme.fg("dim", `v${VERSION}`),
      data.versionWidth,
      width,
      config.align,
    ),
    "",
  ];
}

export function registerAsciiHeader(
  _pi: ExtensionAPI,
  ctx: ExtensionContext,
): Handle {
  const config = loadAsciiHeaderConfig();
  const data = buildAsciiHeaderData(config);

  ctx.ui.setHeader((_tui, theme) => ({
    render(width: number): string[] {
      return buildAsciiHeader(theme, width, config, data);
    },
    invalidate() {},
  }));

  return {
    dispose() {
      ctx.ui.setHeader(undefined);
    },
  };
}
