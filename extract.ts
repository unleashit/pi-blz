import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type {
  AgentToolResult,
  ToolRenderResultOptions,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

export interface ExtractContentOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

const headers: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function getValidUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function webExtract(url: string, options: ExtractContentOptions) {
  const validatedUrl = getValidUrl(url);

  if (!validatedUrl) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort();
  }, options.timeoutMs);

  const signal = options.signal
    ? AbortSignal.any([timeoutController.signal, options.signal])
    : timeoutController.signal;

  try {
    const res = await fetch(validatedUrl, { signal, headers });

    if (!res.ok) {
      throw new Error(`Fetch returned ${res.status} ${res.statusText}`);
    }

    const raw = await res.text();
    const parsedDocument = parseHTML(raw).document;
    const reader = new Readability(parsedDocument);
    const article = reader.parse();

    if (!article) {
      return `Couldn't parse content`;
    }

    return turndown.turndown(article.content);
  } finally {
    clearTimeout(timer);
  }
}

export function renderExtractResult(
  result: AgentToolResult<{
    url: string;
  }>,
  options: ToolRenderResultOptions,
  theme: Theme,
  verbose: boolean,
): string {
  let text = "";

  if (!verbose) {
    return text;
  }

  const output = result.content.find((c) => c.type === "text")?.text ?? "";
  if (output) {
    const lines = output.split("\n");
    const maxLines = options.expanded ? lines.length : 20;
    const displayLines = lines.slice(0, maxLines);
    const remainingLines = lines.length - maxLines;

    text += `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;

    if (remainingLines > 0) {
      text += `${theme.fg("muted", `\n... (${remainingLines} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
    }
  }

  return text;
}
