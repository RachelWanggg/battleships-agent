export const BOARD_SIZE = 10;

export const FLEET = [
  { type: "CARRIER", length: 5 },
  { type: "BATTLESHIP", length: 4 },
  { type: "CRUISER", length: 3 },
  { type: "SUBMARINE", length: 3 },
  { type: "DESTROYER", length: 2 }
] as const;

export type ShipType = (typeof FLEET)[number]["type"];
export type Orientation = "H" | "V";

export type Coord = {
  x: number;
  y: number;
};

export type ShipPlacement = {
  type: ShipType;
  x: number;
  y: number;
  orientation: Orientation;
};

export type ShotResult = "MISS" | "HIT" | "SUNK";

export type ShotRecord = Coord & {
  result: ShotResult;
  shipType?: ShipType;
};

export type GameState = {
  shots: ShotRecord[];
};

export type StrategyConfig = {
  placement: {
    candidateCount: number;
    heatmapWeight: number;
    clusterWeight: number;
    orientationBalanceWeight: number;
  };
  shooting: {
    useProbabilityDensity: boolean;
    huntParity: number;
  };
};
