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
    randomJitterWeight: number;
    opponentShotWeights: number[][];
    telemetryShotCount: number;
    telemetrySourceFiles: string[];
    updatedAt: string | null;
  };
  shooting: {
    useProbabilityDensity: boolean;
    huntParity: number;
  };
};

export type ApiInt = number | string;

export type ApiShipOrientation = "HORIZONTAL" | "VERTICAL";
export type RequiredMove = "PLACE_SHIPS" | "SUBMIT_SHOT";
export type ApiShotOutcome = "MISS" | "HIT" | "SINK";

export type ApiOpponent = {
  opponentId: string;
  displayName: string;
  opponentClass: string;
  baseScore: number;
};

export type ApiBoardRules = {
  gridRows: number;
  gridCols: number;
  shipClasses: Array<{
    class: ShipType;
    length: number;
  }>;
  allowAdjacency: boolean;
};

export type CompetitionRules = {
  competitionId: string;
  displayName: string;
  boardRules: ApiBoardRules;
  opponentRoster: ApiOpponent[];
  scoringConstants: Record<string, unknown>;
  turnTimeoutSeconds: number;
  completionMessage: string;
};

export type ApiFleetShip = {
  shipClass: ShipType;
  orientation: ApiShipOrientation;
  startRow: ApiInt;
  startCol: ApiInt;
  sunk: boolean;
};

export type ApiShotRecord = {
  row: ApiInt;
  col: ApiInt;
  outcome: ApiShotOutcome;
  sunkShipClass?: ShipType;
};

export type MoveState = {
  competitionId: string;
  gameOrdinal: ApiInt;
  totalGames: ApiInt;
  opponent: ApiOpponent;
  nextRequiredMove: RequiredMove;
  nextMoveDeadlineAt: string | null;
  board: ApiBoardRules;
  yourFleet: ApiFleetShip[];
  yourShots: ApiShotRecord[];
  incomingShots: ApiShotRecord[];
  sunkOpponentShipClasses: ShipType[];
};

export type MoveRequiredEnvelope = {
  responseType: "MOVE_REQUIRED";
  state: MoveState;
};

export type GameCompletedEnvelope = {
  responseType: "GAME_COMPLETED";
  gameOutcome: "AGENT_WIN" | "OPPONENT_WIN";
  next: MoveRequiredEnvelope;
};

export type AttemptResult = {
  attemptId: string;
  finalScore: ApiInt;
  wins: ApiInt;
  losses: ApiInt;
  hitDifferential: ApiInt;
  opponentShipsSunk: ApiInt;
  agentShipsLost: ApiInt;
  isNewBest: boolean;
  completionMessage: string;
};

export type AttemptCompletedEnvelope = {
  responseType: "ATTEMPT_COMPLETED";
  result: AttemptResult;
};

export type AttemptDisqualifiedEnvelope = {
  responseType: "ATTEMPT_DISQUALIFIED";
  reason: "TIMEOUT" | "ILLEGAL_MOVE" | "ABANDONED";
  ranked: false;
  attemptId: string;
  context: {
    lastRequiredMove: RequiredMove | null;
    gameOrdinal: ApiInt | null;
    opponentId: string | null;
    deadlineAt: string | null;
  };
};

export type GameplayEnvelope =
  | MoveRequiredEnvelope
  | GameCompletedEnvelope
  | AttemptCompletedEnvelope
  | AttemptDisqualifiedEnvelope;

export type ApiPlacement = {
  shipClass: ShipType;
  orientation: ApiShipOrientation;
  startRow: number;
  startCol: number;
};

export type PlaceShipsRequest = {
  placements: ApiPlacement[];
};

export type SubmitShotRequest = {
  row: number;
  col: number;
};
