import { BOARD_SIZE, FLEET, type Coord, type ShipPlacement } from "./types.js";

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

function randomInt(exclusiveMax: number, random: () => number): number {
  return Math.floor(random() * exclusiveMax);
}

function coordKey({ x, y }: Coord): string {
  return `${x},${y}`;
}
