import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BOARD_SIZE } from "./types.js";
import type { StrategyConfig } from "./types.js";

const CONFIG_PATH = join(process.cwd(), "data", "config.json");

export async function loadConfig(filePath: string = CONFIG_PATH): Promise<StrategyConfig> {
  const raw = await readFile(filePath, "utf8");
  return normalizeConfig(JSON.parse(raw));
}

export async function saveConfig(config: StrategyConfig, filePath: string = CONFIG_PATH): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`);
}

export function normalizeConfig(value: unknown): StrategyConfig {
  const source = isRecord(value) ? value : {};
  const placement = isRecord(source.placement) ? source.placement : {};
  const shooting = isRecord(source.shooting) ? source.shooting : {};

  return {
    placement: {
      candidateCount: numberOrDefault(placement.candidateCount, 200),
      heatmapWeight: numberOrDefault(placement.heatmapWeight, 1),
      clusterWeight: numberOrDefault(placement.clusterWeight, 0.15),
      orientationBalanceWeight: numberOrDefault(placement.orientationBalanceWeight, 0.2),
      randomJitterWeight: numberOrDefault(placement.randomJitterWeight, 0.08),
      opponentShotWeights: normalizeWeights(placement.opponentShotWeights),
      opponentShotWeightsByOpponent: normalizeWeightsByOpponent(placement.opponentShotWeightsByOpponent),
      telemetryShotCount: numberOrDefault(placement.telemetryShotCount, 0),
      telemetrySourceFiles: stringArrayOrDefault(placement.telemetrySourceFiles),
      updatedAt: typeof placement.updatedAt === "string" ? placement.updatedAt : null
    },
    shooting: {
      useProbabilityDensity: booleanOrDefault(shooting.useProbabilityDensity, true),
      huntParity: numberOrDefault(shooting.huntParity, 2)
    }
  };
}

function normalizeWeightsByOpponent(value: unknown): Record<string, number[][]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([opponentId, weights]) => [opponentId, normalizeWeights(weights)] as const)
      .filter(([, weights]) => hasNonZeroWeight(weights))
  );
}

function normalizeWeights(value: unknown): number[][] {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) {
    return emptyWeights();
  }

  const rows = value.map((row) => {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      return undefined;
    }
    return row.map((cell) => Math.max(0, numberOrDefault(cell, 0)));
  });

  if (rows.some((row) => row === undefined)) {
    return emptyWeights();
  }

  return rows as number[][];
}

function hasNonZeroWeight(weights: number[][]): boolean {
  return weights.some((row) => row.some((cell) => cell > 0));
}

function emptyWeights(): number[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayOrDefault(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
