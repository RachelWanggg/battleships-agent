import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StrategyConfig } from "./types.js";

const CONFIG_PATH = join(process.cwd(), "data", "config.json");

export async function loadConfig(): Promise<StrategyConfig> {
  const raw = await readFile(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as StrategyConfig;
}

export async function saveConfig(config: StrategyConfig): Promise<void> {
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}
