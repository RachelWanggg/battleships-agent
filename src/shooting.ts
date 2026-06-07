import { BOARD_SIZE, type Coord, type GameState } from "./types.js";
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

    const target = this.pickTargetNeighbor(state);
    if (target) {
      this.markTried(target);
      return target;
    }

    const hunt = this.pickHuntCell();
    if (hunt) {
      this.markTried(hunt);
      return hunt;
    }

    const fallback = this.pickAnyCell();
    if (!fallback) {
      throw new Error("No legal shots remaining");
    }

    this.markTried(fallback);
    return fallback;
  }

  hasTried(coord: Coord): boolean {
    return this.tried.has(coordKey(coord));
  }

  private pickTargetNeighbor(state: GameState): Coord | undefined {
    const hits = state.shots.filter((shot) => shot.result === "HIT");

    for (const hit of [...hits].reverse()) {
      const candidates = [
        { x: hit.x + 1, y: hit.y },
        { x: hit.x - 1, y: hit.y },
        { x: hit.x, y: hit.y + 1 },
        { x: hit.x, y: hit.y - 1 }
      ];
      const candidate = candidates.find((coord) => isOnBoard(coord) && !this.hasTried(coord));
      if (candidate) {
        return candidate;
      }
    }

    return undefined;
  }

  private pickHuntCell(): Coord | undefined {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const coord = { x, y };
        if ((x + y) % 2 === 0 && !this.hasTried(coord)) {
          return coord;
        }
      }
    }

    return undefined;
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
}

function coordKey({ x, y }: Coord): string {
  return `${x},${y}`;
}
