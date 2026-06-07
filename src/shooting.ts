import { BOARD_SIZE, FLEET, type Coord, type GameState, type ShipType, type ShotRecord } from "./types.js";
import { isOnBoard } from "./placement.js";

export class ShotPlanner {
  private readonly tried = new Set<string>();

  constructor(records: Coord[] = []) {
    for (const record of records) {
      this.markTried(record);
    }
  }

  nextShot(state: GameState): Coord {
    for (const shot of state.shots) {
      this.markTried(shot);
    }

    const target = this.pickProbabilityDensityCell(state);
    if (target) {
      return this.recordSelectedShot(target);
    }

    const fallback = this.pickAnyCell();
    if (!fallback) {
      throw new Error("No legal shots remaining");
    }

    return this.recordSelectedShot(fallback);
  }

  hasTried(coord: Coord): boolean {
    return this.tried.has(coordKey(coord));
  }

  private pickProbabilityDensityCell(state: GameState): Coord | undefined {
    const sunkCells = inferSunkCells(state.shots);
    const misses = new Set(
      state.shots
        .filter((shot) => shot.result === "MISS")
        .map(coordKey)
    );
    const blocked = new Set([...misses, ...sunkCells]);
    const unresolvedHits = state.shots.filter(
      (shot) => shot.result === "HIT" && !sunkCells.has(coordKey(shot))
    );
    const unresolvedHitKeys = new Set(unresolvedHits.map(coordKey));
    const ships = remainingShips(state.shots);
    const placements = ships.flatMap((ship) => enumeratePlacements(ship, blocked));

    let scoringPlacements = placements;
    if (unresolvedHitKeys.size > 0) {
      const hitPlacements = placements
        .map((placement) => ({
          ...placement,
          coveredHits: placement.cells.filter((cell) => unresolvedHitKeys.has(coordKey(cell))).length
        }))
        .filter((placement) => placement.coveredHits > 0);
      const maxCoveredHits = Math.max(0, ...hitPlacements.map((placement) => placement.coveredHits));
      scoringPlacements = hitPlacements.filter((placement) => placement.coveredHits === maxCoveredHits);
    }

    const scores = new Map<string, number>();
    for (const placement of scoringPlacements) {
      const coveredHits = placement.cells.filter((cell) => unresolvedHitKeys.has(coordKey(cell))).length;
      const weight = unresolvedHitKeys.size > 0 ? 10 + coveredHits : 1;
      for (const cell of placement.cells) {
        if (!this.hasTried(cell)) {
          scores.set(coordKey(cell), (scores.get(coordKey(cell)) ?? 0) + weight);
        }
      }
    }

    return this.bestScoredCell(scores);
  }

  private pickAnyCell(): Coord | undefined {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const coord = { x, y };
        if (!this.hasTried(coord)) {
          return coord;
        }
      }
    }

    return undefined;
  }

  private markTried(coord: Coord): void {
    if (!isOnBoard(coord)) {
      throw new Error(`Refusing to record off-board shot: ${coordKey(coord)}`);
    }
    this.tried.add(coordKey(coord));
  }

  private recordSelectedShot(coord: Coord): Coord {
    if (!isOnBoard(coord)) {
      throw new Error(`Refusing to submit off-board shot: ${coordKey(coord)}`);
    }
    if (this.hasTried(coord)) {
      throw new Error(`Refusing to submit repeated shot: ${coordKey(coord)}`);
    }

    this.markTried(coord);
    return coord;
  }

  private bestScoredCell(scores: Map<string, number>): Coord | undefined {
    let best: Coord | undefined;
    let bestScore = -1;

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const coord = { x, y };
        if (this.hasTried(coord)) {
          continue;
        }

        const score = scores.get(coordKey(coord)) ?? 0;
        if (score > bestScore || (score === bestScore && best && isBetterTieBreak(coord, best))) {
          best = coord;
          bestScore = score;
        }
      }
    }

    return bestScore > 0 ? best : undefined;
  }
}

function coordKey({ x, y }: Coord): string {
  return `${x},${y}`;
}

type CandidatePlacement = {
  cells: Coord[];
};

function remainingShips(shots: ShotRecord[]): Array<{ type: ShipType; length: number }> {
  const sunkTypes = new Set(shots.flatMap((shot) => shot.result === "SUNK" && shot.shipType ? [shot.shipType] : []));
  return FLEET.filter((ship) => !sunkTypes.has(ship.type));
}

function enumeratePlacements(
  ship: { type: ShipType; length: number },
  blocked: Set<string>
): CandidatePlacement[] {
  const placements: CandidatePlacement[] = [];

  for (const orientation of ["H", "V"] as const) {
    const maxX = orientation === "H" ? BOARD_SIZE - ship.length : BOARD_SIZE - 1;
    const maxY = orientation === "V" ? BOARD_SIZE - ship.length : BOARD_SIZE - 1;

    for (let y = 0; y <= maxY; y += 1) {
      for (let x = 0; x <= maxX; x += 1) {
        const cells = Array.from({ length: ship.length }, (_, offset) => ({
          x: orientation === "H" ? x + offset : x,
          y: orientation === "V" ? y + offset : y
        }));

        if (cells.every((cell) => isOnBoard(cell) && !blocked.has(coordKey(cell)))) {
          placements.push({ cells });
        }
      }
    }
  }

  return placements;
}

function inferSunkCells(shots: ShotRecord[]): Set<string> {
  const shotByKey = new Map(shots.map((shot) => [coordKey(shot), shot]));
  const sunkCells = new Set<string>();

  for (const shot of shots) {
    if (shot.result !== "SUNK") {
      continue;
    }

    sunkCells.add(coordKey(shot));
    if (!shot.shipType) {
      continue;
    }

    const ship = FLEET.find((candidate) => candidate.type === shot.shipType);
    if (!ship) {
      continue;
    }

    for (const line of [collectLine(shot, 1, 0, shotByKey), collectLine(shot, 0, 1, shotByKey)]) {
      if (line.length >= ship.length) {
        for (const cell of line) {
          sunkCells.add(coordKey(cell));
        }
      }
    }
  }

  return sunkCells;
}

function collectLine(origin: Coord, dx: number, dy: number, shotByKey: Map<string, ShotRecord>): Coord[] {
  return [
    ...collectDirection(origin, -dx, -dy, shotByKey).reverse(),
    origin,
    ...collectDirection(origin, dx, dy, shotByKey)
  ];
}

function collectDirection(
  origin: Coord,
  dx: number,
  dy: number,
  shotByKey: Map<string, ShotRecord>
): Coord[] {
  const cells: Coord[] = [];

  for (let step = 1; step < BOARD_SIZE; step += 1) {
    const cell = { x: origin.x + dx * step, y: origin.y + dy * step };
    const shot = shotByKey.get(coordKey(cell));
    if (!shot || shot.result === "MISS") {
      break;
    }
    cells.push(cell);
  }

  return cells;
}

function isBetterTieBreak(candidate: Coord, current: Coord): boolean {
  const candidateDistance = distanceFromCenter(candidate);
  const currentDistance = distanceFromCenter(current);
  if (candidateDistance !== currentDistance) {
    return candidateDistance < currentDistance;
  }

  if (candidate.y !== current.y) {
    return candidate.y < current.y;
  }

  return candidate.x < current.x;
}

function distanceFromCenter(coord: Coord): number {
  const center = (BOARD_SIZE - 1) / 2;
  return Math.abs(coord.x - center) + Math.abs(coord.y - center);
}
