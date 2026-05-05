import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { Compile } from "typebox/compile";

const configPath = join(homedir(), ".pi", "agent", "search.json");

export interface Config {
  limit: number;
  timeoutMs: number;
  safesearch: 0 | 1 | 2;
  verbose: boolean;
}

const defaultConfig: Config = {
  limit: 10,
  timeoutMs: 15000,
  safesearch: 0,
  verbose: true,
};

const ConfigSchema = Type.Object({
  limit: Type.Number(),
  timeoutMs: Type.Number(),
  safesearch: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
  verbose: Type.Boolean(),
});

let config: Config = defaultConfig;
const configValidator = Compile(ConfigSchema);

function validateConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null) return defaultConfig;

  return configValidator.Check(raw) ? (raw as Config) : defaultConfig;
}

export function loadConfig(): void {
  try {
    if (existsSync(configPath)) {
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      const validated = validateConfig(saved);
      config = validated;
    }

    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  } catch (error) {
    console.error(`Failed to load config from ${configPath}:`, error);
  }
}

export function saveConfig(id: string, value: string): void {
  try {
    let parsed: unknown = value;

    switch (id) {
      case "safesearch":
        const num = Number(parsed);
        if ([0, 1, 2].includes(num)) parsed = num as 0 | 1 | 2;
        break;
      case "verbose":
        parsed = value === "true";
        break;
      default:
        parsed = Number(value);
    }

    const updated = { ...config, [id]: parsed };
    if (configValidator.Check(updated)) {
      config = updated;
      writeFileSync(configPath, JSON.stringify(updated, null, 2));
    }
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

export function getConfig(): Config {
  return config;
}
