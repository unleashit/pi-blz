import { describe, expect, it } from "bun:test";
import { formatTokens } from "./rounded-editor";

describe("formatTokens", () => {
  it("returns raw number under 1000", () => {
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with one decimal under 10000", () => {
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9900)).toBe("9.9k");
  });

  it("formats thousands as rounded integer under 1000000", () => {
    expect(formatTokens(15000)).toBe("15k");
    expect(formatTokens(99400)).toBe("99k");
  });

  it("formats millions with one decimal", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
    expect(formatTokens(9900000)).toBe("9.9M");
  });
});
