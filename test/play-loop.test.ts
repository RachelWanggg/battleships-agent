import assert from "node:assert/strict";
import test from "node:test";
import { validateFleet } from "../src/placement.js";
import { playAttempt } from "../src/play.js";
import type {
  ApiResponse,
  BattleshipsClient
} from "../src/client.js";
import type {
  ApiPlacement,
  GameplayEnvelope,
  MoveRequiredEnvelope,
  MoveState,
  PlaceShipsRequest,
  SubmitShotRequest
} from "../src/types.js";
import { ApiError } from "../src/client.js";

test("playAttempt follows PLACE_SHIPS, GAME_COMPLETED.next, SUBMIT_SHOT, and completion", async () => {
  const calls: string[] = [];
  let placementBody: PlaceShipsRequest | undefined;
  let shotBody: SubmitShotRequest | undefined;

  const client = {
    async createAttempt() {
      calls.push("createAttempt");
      return response(moveRequired("PLACE_SHIPS", 1, []));
    },
    async getCurrentAttempt() {
      throw new Error("getCurrentAttempt should not be called");
    },
    async placeShips(body: PlaceShipsRequest) {
      calls.push("placeShips");
      placementBody = body;
      return response({
        responseType: "GAME_COMPLETED",
        gameOutcome: "AGENT_WIN",
        next: moveRequired("SUBMIT_SHOT", 2, [{ row: 0, col: 0, outcome: "MISS" }])
      });
    },
    async submitShot(body: SubmitShotRequest) {
      calls.push("submitShot");
      shotBody = body;
      return response({
        responseType: "ATTEMPT_COMPLETED",
        result: {
          attemptId: "attempt-1",
          finalScore: 123,
          wins: 1,
          losses: 0,
          hitDifferential: 3,
          opponentShipsSunk: 5,
          agentShipsLost: 0,
          isNewBest: true,
          completionMessage: "done"
        }
      });
    }
  } satisfies Pick<
    BattleshipsClient,
    "createAttempt" | "getCurrentAttempt" | "placeShips" | "submitShot"
  >;

  const terminal = await playAttempt(client, memoryTelemetry());

  assert.deepEqual(calls, ["createAttempt", "placeShips", "submitShot"]);
  assert.equal(terminal.responseType, "ATTEMPT_COMPLETED");
  assert.equal(terminal.result.finalScore, 123);
  assert.ok(placementBody);
  assert.deepEqual(validateFleet(fromApiPlacements(placementBody.placements)), []);
  assert.ok(shotBody);
  assert.notDeepEqual(shotBody, { row: 0, col: 0 });
  assert.ok(shotBody.row >= 0 && shotBody.row < 10);
  assert.ok(shotBody.col >= 0 && shotBody.col < 10);
});

test("playAttempt stops immediately on ATTEMPT_DISQUALIFIED", async () => {
  let submitCalls = 0;
  const client = {
    async createAttempt() {
      return response({
        responseType: "ATTEMPT_DISQUALIFIED",
        reason: "ILLEGAL_MOVE",
        ranked: false,
        attemptId: "attempt-1",
        context: {
          lastRequiredMove: "SUBMIT_SHOT",
          gameOrdinal: 1,
          opponentId: "opponent-1",
          deadlineAt: null
        }
      });
    },
    async getCurrentAttempt() {
      throw new Error("getCurrentAttempt should not be called");
    },
    async placeShips() {
      throw new Error("placeShips should not be called");
    },
    async submitShot() {
      submitCalls += 1;
      throw new Error("submitShot should not be called");
    }
  } satisfies Pick<
    BattleshipsClient,
    "createAttempt" | "getCurrentAttempt" | "placeShips" | "submitShot"
  >;

  const terminal = await playAttempt(client, memoryTelemetry());

  assert.equal(terminal.responseType, "ATTEMPT_DISQUALIFIED");
  assert.equal(terminal.reason, "ILLEGAL_MOVE");
  assert.equal(submitCalls, 0);
});

test("playAttempt resumes current attempt after createAttempt conflict", async () => {
  const calls: string[] = [];
  const client = {
    async createAttempt() {
      calls.push("createAttempt");
      throw new ApiError(
        "POST /attempts failed: 409 active",
        409,
        "request-conflict",
        JSON.stringify({ code: "ACTIVE_ATTEMPT_EXISTS", message: "active" })
      );
    },
    async getCurrentAttempt() {
      calls.push("getCurrentAttempt");
      return response({
        responseType: "ATTEMPT_COMPLETED",
        result: {
          attemptId: "attempt-1",
          finalScore: 77,
          wins: 1,
          losses: 0,
          hitDifferential: 1,
          opponentShipsSunk: 1,
          agentShipsLost: 0,
          isNewBest: false,
          completionMessage: "resumed"
        }
      });
    },
    async placeShips() {
      throw new Error("placeShips should not be called");
    },
    async submitShot() {
      throw new Error("submitShot should not be called");
    }
  } satisfies Pick<
    BattleshipsClient,
    "createAttempt" | "getCurrentAttempt" | "placeShips" | "submitShot"
  >;

  const terminal = await playAttempt(client, memoryTelemetry());

  assert.deepEqual(calls, ["createAttempt", "getCurrentAttempt"]);
  assert.equal(terminal.responseType, "ATTEMPT_COMPLETED");
  assert.equal(terminal.result.finalScore, 77);
});

test("playAttempt does not block moves on slow telemetry writes", async () => {
  const calls: string[] = [];
  const client = {
    async createAttempt() {
      calls.push("createAttempt");
      return response(moveRequired("SUBMIT_SHOT", 1, []));
    },
    async getCurrentAttempt() {
      throw new Error("getCurrentAttempt should not be called");
    },
    async placeShips() {
      throw new Error("placeShips should not be called");
    },
    async submitShot() {
      calls.push("submitShot");
      return response({
        responseType: "ATTEMPT_COMPLETED",
        result: {
          attemptId: "attempt-1",
          finalScore: 1,
          wins: 1,
          losses: 0,
          hitDifferential: 1,
          opponentShipsSunk: 1,
          agentShipsLost: 0,
          isNewBest: false,
          completionMessage: "done"
        }
      });
    }
  } satisfies Pick<
    BattleshipsClient,
    "createAttempt" | "getCurrentAttempt" | "placeShips" | "submitShot"
  >;

  const terminal = await playAttempt(client, {
    async write() {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  assert.deepEqual(calls, ["createAttempt", "submitShot"]);
  assert.equal(terminal.responseType, "ATTEMPT_COMPLETED");
});

function response<T extends GameplayEnvelope>(data: T): ApiResponse<T> {
  return {
    data,
    requestId: "request-id"
  };
}

function moveRequired(
  nextRequiredMove: MoveState["nextRequiredMove"],
  gameOrdinal: number,
  yourShots: MoveState["yourShots"]
): MoveRequiredEnvelope {
  return {
    responseType: "MOVE_REQUIRED",
    state: {
      competitionId: "295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c",
      gameOrdinal,
      totalGames: 15,
      opponent: {
        opponentId: `opponent-${gameOrdinal}`,
        displayName: `Opponent ${gameOrdinal}`,
        opponentClass: "TEST",
        baseScore: 100
      },
      nextRequiredMove,
      nextMoveDeadlineAt: new Date(Date.now() + 10_000).toISOString(),
      board: {
        gridRows: 10,
        gridCols: 10,
        allowAdjacency: true,
        shipClasses: [
          { class: "CARRIER", length: 5 },
          { class: "BATTLESHIP", length: 4 },
          { class: "CRUISER", length: 3 },
          { class: "SUBMARINE", length: 3 },
          { class: "DESTROYER", length: 2 }
        ]
      },
      yourFleet: [],
      yourShots,
      incomingShots: [],
      sunkOpponentShipClasses: []
    }
  };
}

function fromApiPlacements(placements: ApiPlacement[]) {
  return placements.map((placement) => ({
    type: placement.shipClass,
    orientation: placement.orientation === "HORIZONTAL" ? "H" as const : "V" as const,
    x: placement.startCol,
    y: placement.startRow
  }));
}

function memoryTelemetry() {
  return {
    async write() {
      return undefined;
    }
  };
}
