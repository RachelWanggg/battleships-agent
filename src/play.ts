import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ApiError, BattleshipsClient, parseErrorCode, type ApiResponse } from "./client.js";
import { loadConfig } from "./config.js";
import { generateAdaptiveFleet, generateRandomFleet, validateFleet } from "./placement.js";
import { ShotPlanner } from "./shooting.js";
import { TelemetryWriter } from "./telemetry.js";
import type {
  ApiShotRecord,
  Coord,
  GameplayEnvelope,
  GameState,
  MoveRequiredEnvelope,
  ShipPlacement,
  ShotRecord,
  StrategyConfig
} from "./types.js";

type TelemetrySink = {
  write: (event: string, data: Record<string, unknown>) => Promise<void>;
};

type TelemetryLogger = {
  write: (event: string, data: Record<string, unknown>) => void;
  flush: () => Promise<void>;
};

type GameClient = Pick<
  BattleshipsClient,
  "createAttempt" | "getCurrentAttempt" | "placeShips" | "submitShot"
>;

async function main(): Promise<void> {
  const startedAt = new Date().toISOString().replaceAll(":", "-");
  const telemetry = new TelemetryWriter(join(process.cwd(), "data", "attempts", `${startedAt}.jsonl`));
  const client = new BattleshipsClient();

  const terminal = await playAttempt(client, telemetry, startedAt);
  if (terminal.responseType === "ATTEMPT_COMPLETED") {
    console.log(`Final score: ${terminal.result.finalScore}`);
    console.log(JSON.stringify(terminal.result, null, 2));
    return;
  }

  console.log(`ATTEMPT_DISQUALIFIED: ${terminal.reason}`);
  console.log(JSON.stringify(terminal, null, 2));
}

export async function playAttempt(
  client: GameClient,
  telemetry: TelemetrySink,
  startedAt: string = new Date().toISOString()
): Promise<Extract<GameplayEnvelope, { responseType: "ATTEMPT_COMPLETED" | "ATTEMPT_DISQUALIFIED" }>> {
  const logger = createTelemetryLogger(telemetry);
  const planners = new Map<number, ShotPlanner>();
  const config = await loadConfig();

  logger.write("agent_started", { startedAt });

  let envelope = await startOrResumeAttempt(client, logger);
  let moves = 0;

  while (true) {
    moves += 1;
    if (moves > 2000) {
      throw new Error("Refusing to continue after 2000 moves without a terminal response");
    }

    if (envelope.responseType === "MOVE_REQUIRED") {
      envelope = await handleMoveRequired(client, logger, planners, config, envelope);
      continue;
    }

    if (envelope.responseType === "GAME_COMPLETED") {
      logger.write("game_completed", {
        gameOutcome: envelope.gameOutcome,
        nextGameOrdinal: toNumber(envelope.next.state.gameOrdinal),
        opponentId: envelope.next.state.opponent.opponentId
      });
      envelope = envelope.next;
      continue;
    }

    if (envelope.responseType === "ATTEMPT_COMPLETED") {
      logger.write("attempt_completed", { result: envelope.result });
      await logger.flush();
      return envelope;
    }

    if (envelope.responseType === "ATTEMPT_DISQUALIFIED") {
      logger.write("attempt_disqualified", {
        attemptId: envelope.attemptId,
        reason: envelope.reason,
        context: envelope.context
      });
      await logger.flush();
      return envelope;
    }

    assertNever(envelope);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function startOrResumeAttempt(
  client: GameClient,
  telemetry: TelemetryLogger
): Promise<GameplayEnvelope> {
  try {
    const created = await client.createAttempt();
    telemetry.write("create_attempt", requestTelemetry(created));
    return created.data;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 409) {
      telemetry.write("create_attempt_conflict", {
        requestId: error.requestId,
        code: parseErrorCode(error),
        body: error.body
      });
      const current = await client.getCurrentAttempt();
      telemetry.write("get_current_attempt", requestTelemetry(current));
      return current.data;
    }
    throw error;
  }
}

async function handleMoveRequired(
  client: GameClient,
  telemetry: TelemetryLogger,
  planners: Map<number, ShotPlanner>,
  config: StrategyConfig,
  envelope: MoveRequiredEnvelope
): Promise<GameplayEnvelope> {
  const { state } = envelope;
  const gameOrdinal = toNumber(state.gameOrdinal);

  telemetry.write("move_required", {
    requestId: null,
    gameOrdinal,
    totalGames: toNumber(state.totalGames),
    opponentId: state.opponent.opponentId,
    nextRequiredMove: state.nextRequiredMove,
    nextMoveDeadlineAt: state.nextMoveDeadlineAt,
    yourShots: state.yourShots,
    opponentShots: state.incomingShots
  });

  if (state.nextRequiredMove === "PLACE_SHIPS") {
    const placements = generateValidatedFleet(config);
    const response = await client.placeShips({ placements: placements.map(toApiPlacement) });
    telemetry.write("place_ships", {
      ...requestTelemetry(response),
      gameOrdinal,
      opponentId: state.opponent.opponentId,
      placements
    });
    planners.set(gameOrdinal, new ShotPlanner(toLocalShots(state.yourShots)));
    return response.data;
  }

  if (state.nextRequiredMove === "SUBMIT_SHOT") {
    const planner = getPlanner(planners, gameOrdinal, state.yourShots);
    const shot = planner.nextShot(toGameState(state.yourShots));
    assertShotIsFresh(shot, state.yourShots);

    const response = await client.submitShot({ row: shot.y, col: shot.x });
    telemetry.write("submit_shot", {
      ...requestTelemetry(response),
      gameOrdinal,
      opponentId: state.opponent.opponentId,
      shot,
      serverShot: { row: shot.y, col: shot.x }
    });
    return response.data;
  }

  return assertNever(state.nextRequiredMove);
}

function generateValidatedFleet(config: StrategyConfig): ShipPlacement[] {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const placements = attempt === 0 ? generateAdaptiveFleet(config) : generateRandomFleet();
    const errors = validateFleet(placements);
    if (errors.length === 0) {
      return placements;
    }
  }
  throw new Error("Failed to generate a legal fleet after 100 attempts");
}

function getPlanner(
  planners: Map<number, ShotPlanner>,
  gameOrdinal: number,
  shots: ApiShotRecord[]
): ShotPlanner {
  const existing = planners.get(gameOrdinal);
  if (existing) {
    return existing;
  }

  const planner = new ShotPlanner(toLocalShots(shots));
  planners.set(gameOrdinal, planner);
  return planner;
}

export function toApiPlacement(placement: ShipPlacement) {
  return {
    shipClass: placement.type,
    orientation: placement.orientation === "H" ? "HORIZONTAL" as const : "VERTICAL" as const,
    startRow: placement.y,
    startCol: placement.x
  };
}

export function toGameState(shots: ApiShotRecord[]): GameState {
  return { shots: toLocalShots(shots) };
}

export function toLocalShots(shots: ApiShotRecord[]): ShotRecord[] {
  return shots.map((shot) => ({
    x: toNumber(shot.col),
    y: toNumber(shot.row),
    result: shot.outcome === "SINK" ? "SUNK" : shot.outcome,
    shipType: shot.sunkShipClass
  }));
}

function assertShotIsFresh(shot: Coord, priorShots: ApiShotRecord[]): void {
  if (priorShots.some((prior) => toNumber(prior.col) === shot.x && toNumber(prior.row) === shot.y)) {
    throw new Error(`Refusing to submit repeated shot at ${shot.x},${shot.y}`);
  }
}

function requestTelemetry<T>(response: ApiResponse<T>): Record<string, unknown> {
  return {
    requestId: response.requestId,
    responseType:
      isRecord(response.data) && typeof response.data.responseType === "string"
        ? response.data.responseType
        : undefined
  };
}

function createTelemetryLogger(telemetry: TelemetrySink): TelemetryLogger {
  let queue: Promise<void> = Promise.resolve();

  return {
    write(event: string, data: Record<string, unknown>): void {
      queue = queue
        .then(() => telemetry.write(event, data))
        .catch((error: unknown) => {
          console.error("Telemetry write failed:", error);
        });
    },
    async flush(): Promise<void> {
      await queue;
    }
  };
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
