import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { BOARD_SIZE, FLEET, type Coord, type ShipPlacement } from "./types.js";
import type { StrategyConfig } from "./types.js";

export type OpponentShotHeatmap = {
  counts: number[][];
  weights: number[][];
  countsByOpponent: Record<string, number[][]>;
  weightsByOpponent: Record<string, number[][]>;
  totalShots: number;
  sourceFiles: string[];
};

export type FleetScore = {
  total: number;
  heatExposure: number;
  clusterPenalty: number;
  orientationPenalty: number;
  randomJitter: number;
};

export function cellsForPlacement(placement: ShipPlacement): Coord[] {
  const ship = FLEET.find((candidate) => candidate.type === placement.type);
  if (!ship) {
    throw new Error(`Unknown ship type: ${placement.type}`);
  }

  return Array.from({ length: ship.length }, (_, offset) => ({
    x: placement.orientation === "H" ? placement.x + offset : placement.x,
    y: placement.orientation === "V" ? placement.y + offset : placement.y
  }));
}

export function isOnBoard({ x, y }: Coord): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function validateFleet(placements: ShipPlacement[]): string[] {
  const errors: string[] = [];
  const seenShips = new Set<string>();
  const occupied = new Map<string, string>();

  for (const placement of placements) {
    if (seenShips.has(placement.type)) {
      errors.push(`Duplicate ship: ${placement.type}`);
    }
    seenShips.add(placement.type);

    for (const cell of cellsForPlacement(placement)) {
      const key = coordKey(cell);
      if (!isOnBoard(cell)) {
        errors.push(`${placement.type} is off-board at ${key}`);
        continue;
      }

      const existing = occupied.get(key);
      if (existing) {
        errors.push(`${placement.type} overlaps ${existing} at ${key}`);
      }
      occupied.set(key, placement.type);
    }
  }

  for (const ship of FLEET) {
    if (!seenShips.has(ship.type)) {
      errors.push(`Missing ship: ${ship.type}`);
    }
  }

  return errors;
}

export function generateRandomFleet(random: () => number = Math.random): ShipPlacement[] {
  const placements: ShipPlacement[] = [];
  const occupied = new Set<string>();

  for (const ship of FLEET) {
    let placement: ShipPlacement | undefined;

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const orientation = random() < 0.5 ? "H" : "V";
      const maxX = orientation === "H" ? BOARD_SIZE - ship.length : BOARD_SIZE - 1;
      const maxY = orientation === "V" ? BOARD_SIZE - ship.length : BOARD_SIZE - 1;
      const candidate: ShipPlacement = {
        type: ship.type,
        orientation,
        x: randomInt(maxX + 1, random),
        y: randomInt(maxY + 1, random)
      };
      const cells = cellsForPlacement(candidate);

      if (cells.every((cell) => isOnBoard(cell) && !occupied.has(coordKey(cell)))) {
        placement = candidate;
        for (const cell of cells) {
          occupied.add(coordKey(cell));
        }
        break;
      }
    }

    if (!placement) {
      throw new Error(`Failed to place ${ship.type}`);
    }

    placements.push(placement);
  }

  return placements;
}

export function generateAdaptiveFleet(
  config: StrategyConfig,
  opponentId?: string,
  random: () => number = Math.random
): ShipPlacement[] {
  const candidateCount = Math.max(1, Math.floor(config.placement.candidateCount));
  const effectiveConfig = configWithOpponentPlacementWeights(config, opponentId);
  let bestFleet: ShipPlacement[] | undefined;
  let bestScore: FleetScore | undefined;

  for (let i = 0; i < candidateCount; i += 1) {
    const fleet = generateRandomFleet(random);
    const errors = validateFleet(fleet);
    if (errors.length > 0) {
      continue;
    }

    const score = scoreFleetCandidate(fleet, effectiveConfig, random);
    if (!bestScore || score.total < bestScore.total) {
      bestFleet = fleet;
      bestScore = score;
    }
  }

  if (!bestFleet) {
    throw new Error("Failed to generate a legal adaptive fleet");
  }

  return bestFleet;
}

export function scoreFleetCandidate(
  fleet: ShipPlacement[],
  config: StrategyConfig,
  random: () => number = Math.random
): FleetScore {
  const validationErrors = validateFleet(fleet);
  if (validationErrors.length > 0) {
    return {
      total: Number.POSITIVE_INFINITY,
      heatExposure: Number.POSITIVE_INFINITY,
      clusterPenalty: Number.POSITIVE_INFINITY,
      orientationPenalty: Number.POSITIVE_INFINITY,
      randomJitter: 0
    };
  }

  const heatExposure = scoreHeatExposure(fleet, config.placement.opponentShotWeights);
  const clusterPenalty = scoreClustering(fleet);
  const orientationPenalty = scoreOrientationBalance(fleet);
  const randomJitter = random();
  const total =
    heatExposure * config.placement.heatmapWeight +
    clusterPenalty * config.placement.clusterWeight +
    orientationPenalty * config.placement.orientationBalanceWeight -
    randomJitter * config.placement.randomJitterWeight;

  return { total, heatExposure, clusterPenalty, orientationPenalty, randomJitter };
}

export async function loadOpponentShotHeatmap(
  attemptsDir: string = join(process.cwd(), "data", "attempts")
): Promise<OpponentShotHeatmap> {
  let entries: string[];
  try {
    entries = await readdir(attemptsDir);
  } catch {
    return emptyHeatmap([]);
  }

  const sourceFiles = entries.filter((entry) => entry.endsWith(".jsonl")).sort();
  const counts = createMatrix();
  const countsByOpponent: Record<string, number[][]> = {};
  let totalShots = 0;

  for (const fileName of sourceFiles) {
    const raw = await readFile(join(attemptsDir, fileName), "utf8");
    const seen = new Set<string>();

    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "") {
        continue;
      }

      const event = parseTelemetryLine(line);
      if (!event || event.event !== "move_required" || !isRecord(event.data)) {
        continue;
      }

      const gameOrdinal = stringKey(event.data.gameOrdinal);
      const opponentId = stringKey(event.data.opponentId);
      const shots = Array.isArray(event.data.opponentShots) ? event.data.opponentShots : [];

      for (const shot of shots) {
        const coord = shotToCoord(shot);
        if (!coord || !isOnBoard(coord)) {
          continue;
        }

        const key = `${fileName}:${gameOrdinal}:${opponentId}:${coord.x},${coord.y}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        counts[coord.y][coord.x] += 1;
        countsByOpponent[opponentId] ??= createMatrix();
        countsByOpponent[opponentId][coord.y][coord.x] += 1;
        totalShots += 1;
      }
    }
  }

  return {
    counts,
    weights: normalizeHeatmap(counts),
    countsByOpponent,
    weightsByOpponent: normalizeHeatmapsByOpponent(countsByOpponent),
    totalShots,
    sourceFiles
  };
}

export function configWithPlacementWeights(
  config: StrategyConfig,
  heatmap: OpponentShotHeatmap,
  updatedAt: string = new Date().toISOString()
): StrategyConfig {
  return {
    ...config,
    placement: {
      ...config.placement,
      opponentShotWeights: heatmap.weights,
      opponentShotWeightsByOpponent: heatmap.weightsByOpponent,
      telemetryShotCount: heatmap.totalShots,
      telemetrySourceFiles: heatmap.sourceFiles,
      updatedAt
    }
  };
}

export function configWithOpponentPlacementWeights(
  config: StrategyConfig,
  opponentId: string | undefined
): StrategyConfig {
  const opponentWeights = opponentId
    ? config.placement.opponentShotWeightsByOpponent[opponentId]
    : undefined;

  if (!opponentWeights) {
    return config;
  }

  return {
    ...config,
    placement: {
      ...config.placement,
      opponentShotWeights: opponentWeights
    }
  };
}

function randomInt(exclusiveMax: number, random: () => number): number {
  return Math.floor(random() * exclusiveMax);
}

function coordKey({ x, y }: Coord): string {
  return `${x},${y}`;
}

function scoreHeatExposure(fleet: ShipPlacement[], weights: number[][]): number {
  return fleet
    .flatMap(cellsForPlacement)
    .reduce((total, cell) => total + (weights[cell.y]?.[cell.x] ?? 0), 0);
}

function scoreClustering(fleet: ShipPlacement[]): number {
  const cellsByShip = new Map<string, Coord[]>();
  for (const placement of fleet) {
    cellsByShip.set(placement.type, cellsForPlacement(placement));
  }

  let penalty = 0;
  const ships = [...cellsByShip.entries()];
  for (let i = 0; i < ships.length; i += 1) {
    for (let j = i + 1; j < ships.length; j += 1) {
      const [, firstCells] = ships[i];
      const [, secondCells] = ships[j];
      let minDistance = Number.POSITIVE_INFINITY;

      for (const first of firstCells) {
        for (const second of secondCells) {
          const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
          minDistance = Math.min(minDistance, distance);
        }
      }

      if (minDistance <= 1) {
        penalty += 2;
      } else if (minDistance === 2) {
        penalty += 0.75;
      } else if (minDistance === 3) {
        penalty += 0.25;
      }
    }
  }

  return penalty;
}

function scoreOrientationBalance(fleet: ShipPlacement[]): number {
  const horizontal = fleet.filter((placement) => placement.orientation === "H").length;
  const vertical = fleet.length - horizontal;
  return Math.abs(horizontal - vertical) / fleet.length;
}

function normalizeHeatmap(counts: number[][]): number[][] {
  const max = Math.max(0, ...counts.flat());
  if (max === 0) {
    return createMatrix();
  }
  return counts.map((row) => row.map((count) => Number((count / max).toFixed(4))));
}

function normalizeHeatmapsByOpponent(countsByOpponent: Record<string, number[][]>): Record<string, number[][]> {
  return Object.fromEntries(
    Object.entries(countsByOpponent).map(([opponentId, counts]) => [opponentId, normalizeHeatmap(counts)])
  );
}

function createMatrix(): number[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));
}

function emptyHeatmap(sourceFiles: string[]): OpponentShotHeatmap {
  const counts = createMatrix();
  return {
    counts,
    weights: createMatrix(),
    countsByOpponent: {},
    weightsByOpponent: {},
    totalShots: 0,
    sourceFiles
  };
}

function parseTelemetryLine(line: string): { event: string; data: unknown } | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed) || typeof parsed.event !== "string") {
      return undefined;
    }
    return { event: parsed.event, data: parsed.data };
  } catch {
    return undefined;
  }
}

function shotToCoord(value: unknown): Coord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const x = toNumber(value.col);
  const y = toNumber(value.row);
  return x === undefined || y === undefined ? undefined : { x, y };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringKey(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
