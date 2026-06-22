import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { ExtensionRunner } from "@earendil-works/pi-coding-agent";
import ext from "./index";
import { cleanRunnerProto, PROTOTYPE_PATCHED } from "./test-helpers";

beforeEach(cleanRunnerProto);
afterEach(cleanRunnerProto);

function mkPi() {
  const registeredTools: string[] = [];
  const activeTools: string[] = [];
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  let activeToolsArg: string[] | undefined;

  return {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    },
    registerTool: (tool: { name: string }) => {
      registeredTools.push(tool.name);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools: (tools: string[]) => {
      activeToolsArg = tools;
    },
    getThinkingLevel: () => "off",
    // Test helpers
    _handlers: handlers,
    _registeredTools: () => registeredTools,
    _setActiveToolsArg: () => activeToolsArg,
    _setActiveTools: (tools: string[]) => {
      activeTools.push(...tools);
    },
  } as unknown as ExtensionAPI & {
    _handlers: Record<string, Array<(...args: unknown[]) => void>>;
    _registeredTools: () => string[];
    _setActiveToolsArg: () => string[] | undefined;
    _setActiveTools: (tools: string[]) => void;
  };
}

function mkCtx(overrides?: Partial<ExtensionContext>) {
  return {
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      setEditorComponent: overrides?.ui?.setEditorComponent ?? (() => {}),
      setFooter: overrides?.ui?.setFooter ?? (() => {}),
      setWorkingIndicator: overrides?.ui?.setWorkingIndicator ?? (() => {}),
      setWorkingMessage: overrides?.ui?.setWorkingMessage ?? (() => {}),
      setHeader: overrides?.ui?.setHeader ?? (() => {}),
      setHiddenThinkingLabel:
        overrides?.ui?.setHiddenThinkingLabel ?? (() => {}),
      theme: {
        fg: () => "",
        getFgAnsi: () => "",
        getColorMode: () => "truecolor",
        getThinkingBorderColor: () => () => "",
        getBashModeBorderColor: () => () => "",
      },
      notify: () => {},
    },
    sessionManager: {
      getEntries: () => [],
    },
    getContextUsage: () => undefined,
    model: undefined,
    ...overrides,
  } as unknown as ExtensionContext;
}

describe("extension lifecycle", () => {
  it("session_start patches tools and preserves pre-existing active tools", () => {
    const pi = mkPi();
    // Simulate a pre-existing active tool from another extension
    (pi as any)._setActiveTools(["custom"]);

    ext(pi);

    const ctx = mkCtx();
    const handler = (pi as any)._handlers.session_start[0];
    handler({} as any, ctx);

    const active = (pi as any)._setActiveToolsArg();
    expect(active).toContain("read");
    expect(active).toContain("bash");
    expect(active).toContain("custom");
    expect(active.length).toBeGreaterThan(7); // built-ins + custom
  });

  it("session_start skips UI enhancements when hasUI is false", () => {
    const pi = mkPi();
    ext(pi);

    let editorSet = false;
    let workingSet = false;
    const ctx = mkCtx({
      hasUI: false,
      ui: {
        setEditorComponent: () => {
          editorSet = true;
        },
        setWorkingIndicator: () => {
          workingSet = true;
        },
      } as any,
    });

    const handler = (pi as any)._handlers.session_start[0];
    handler({} as any, ctx);

    expect(editorSet).toBe(false);
    expect(workingSet).toBe(false);
  });

  it("session_start registers UI enhancements when hasUI is true", () => {
    const pi = mkPi();
    ext(pi);

    let editorSet = false;
    const ctx = mkCtx({
      hasUI: true,
      ui: {
        setEditorComponent: () => {
          editorSet = true;
        },
        setFooter: () => {},
        setWorkingIndicator: () => {},
        setWorkingMessage: () => {},
        setHeader: () => {},
        setHiddenThinkingLabel: () => {},
        theme: {
          fg: () => "",
          getFgAnsi: () => "",
          getColorMode: () => "truecolor",
          getThinkingBorderColor: () => () => "",
          getBashModeBorderColor: () => () => "",
        },
        notify: () => {},
      } as any,
    });

    const handler = (pi as any)._handlers.session_start[0];
    handler({} as any, ctx);

    // Rounded editor calls setEditorComponent directly
    expect(editorSet).toBe(true);
    // Working indicator registers agent_start/agent_end handlers
    expect((pi as any)._handlers.agent_start).toBeDefined();
    expect((pi as any)._handlers.agent_end).toBeDefined();
  });

  it("session_shutdown disposes all handles", () => {
    const pi = mkPi();
    ext(pi);

    const ctx = mkCtx();
    const startHandler = (pi as any)._handlers.session_start[0];
    startHandler({} as any, ctx);

    const registeredBefore = (pi as any)._registeredTools();
    expect(registeredBefore.length).toBeGreaterThan(0);

    // Trigger shutdown
    const shutdownHandler = (pi as any)._handlers.session_shutdown[0];
    shutdownHandler({} as any);

    // The custom tool rendering patch should be disposed
    const proto = ExtensionRunner.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    expect(proto[PROTOTYPE_PATCHED]).toBeUndefined();
  });
});
