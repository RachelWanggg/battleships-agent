import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadConfig, saveConfig } from "../src/config.js";
import {
  configWithPlacementWeights,
  configWithOpponentPlacementWeights,
  generateAdaptiveFleet,
  generateRandomFleet,
  loadOpponentShotHeatmap,
  scoreFleetCandidate,
  validateFleet
} from "../src/placement.js";
import { BOARD_SIZE, FLEET, type StrategyConfig } from "../src/types.js";

test("generateRandomFleet creates complete legal fleets", () => {
  for (let i = 0; i < 1000; i += 1) {
    const fleet = generateRandomFleet();
    assert.equal(fleet.length, FLEET.length);
    assert.deepEqual(validateFleet(fleet), []);
  }
});

test("loadOpponentShotHeatmap de-duplicates cumulative opponent shots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "battleships-heatmap-"));
  try {
    await writeFile(join(dir, "attempt.jsonl"), [
      JSON.stringify({
        event: "move_required",
        data: {
          gameOrdinal: 1,
          opponentId: "opponent-a",
          opponentShots: [{ row: 0, col: 0, outcome: "MISS" }]
        }
      }),
      JSON.stringify({
        event: "move_required",
        data: {
          gameOrdinal: 1,
          opponentId: "opponent-a",
          opponentShots: [
            { row: 0, col: 0, outcome: "MISS" },
            { row: "1", col: "2", outcome: "HIT" }
          ]
        }
      }),
      JSON.stringify({
        event: "move_required",
        data: {
          gameOrdinal: 2,
          opponentId: "opponent-b",
          opponentShots: [{ row: 0, col: 0, outcome: "MISS" }]
        }
      })
    ].join("\n"));

    const heatmap = await loadOpponentShotHeatmap(dir);

    assert.equal(heatmap.totalShots, 3);
    assert.equal(heatmap.counts[0][0], 2);
    assert.equal(heatmap.counts[1][2], 1);
    assert.equal(heatmap.weights[0][0], 1);
    assert.equal(heatmap.weights[1][2], 0.5);
    assert.equal(heatmap.weightsByOpponent["opponent-a"][0][0], 1);
    assert.equal(heatmap.weightsByOpponent["opponent-a"][1][2], 1);
    assert.equal(heatmap.weightsByOpponent["opponent-b"][0][0], 1);
    assert.deepEqual(heatmap.sourceFiles, ["attempt.jsonl"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scoreFleetCandidate prefers lower heat exposure", () => {
  const config = testConfig();
  config.placement.heatmapWeight = 10;
  config.placement.clusterWeight = 0;
  config.placement.orientationBalanceWeight = 0;
  config.placement.randomJitterWeight = 0;
  config.placement.opponentShotWeights = zeroWeights();
  for (let x = 0; x < 5; x += 1) {
    config.placement.opponentShotWeights[0][x] = 1;
  }

  const hotFleet = [
    { type: "CARRIER", orientation: "H", x: 0, y: 0 },
    { type: "BATTLESHIP", orientation: "H", x: 0, y: 2 },
    { type: "CRUISER", orientation: "H", x: 0, y: 4 },
    { type: "SUBMARINE", orientation: "H", x: 0, y: 6 },
    { type: "DESTROYER", orientation: "H", x: 0, y: 8 }
  ] as const;
  const coolFleet = [
    { type: "CARRIER", orientation: "H", x: 5, y: 9 },
    { type: "BATTLESHIP", orientation: "H", x: 0, y: 2 },
    { type: "CRUISER", orientation: "H", x: 0, y: 4 },
    { type: "SUBMARINE", orientation: "H", x: 0, y: 6 },
    { type: "DESTROYER", orientation: "H", x: 0, y: 8 }
  ] as const;

  const hotScore = scoreFleetCandidate([...hotFleet], config, () => 0);
  const coolScore = scoreFleetCandidate([...coolFleet], config, () => 0);

  assert.equal(hotScore.heatExposure, 5);
  assert.equal(coolScore.heatExposure, 0);
  assert.ok(coolScore.total < hotScore.total);
});

test("generateAdaptiveFleet returns legal fleets while using saved weights", () => {
  const config = testConfig();
  config.placement.candidateCount = 40;
  config.placement.opponentShotWeights = zeroWeights();
  config.placement.opponentShotWeights[4][4] = 1;

  for (let i = 0; i < 50; i += 1) {
    const fleet = generateAdaptiveFleet(config);
    assert.equal(fleet.length, FLEET.length);
    assert.deepEqual(validateFleet(fleet), []);
  }
});

test("configWithPlacementWeights persists adaptive placement weights", async () => {
  const dir = await mkdtemp(join(tmpdir(), "battleships-config-"));
  const configPath = join(dir, "config.json");
  try {
    const config = testConfig();
    const heatmap = {
      counts: zeroWeights(),
      weights: zeroWeights(),
      countsByOpponent: {},
      weightsByOpponent: {},
      totalShots: 12,
      sourceFiles: ["attempt-a.jsonl"]
    };
    heatmap.weights[3][4] = 0.75;

    const updated = configWithPlacementWeights(config, heatmap, "2026-06-07T00:00:00.000Z");
    await saveConfig(updated, configPath);
    const raw = JSON.parse(await readFile(configPath, "utf8")) as StrategyConfig;
    const loaded = await loadConfig(configPath);

    assert.equal(raw.placement.telemetryShotCount, 12);
    assert.equal(loaded.placement.opponentShotWeights[3][4], 0.75);
    assert.deepEqual(loaded.placement.opponentShotWeightsByOpponent, {});
    assert.deepEqual(loaded.placement.telemetrySourceFiles, ["attempt-a.jsonl"]);
    assert.equal(loaded.placement.updatedAt, "2026-06-07T00:00:00.000Z");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("configWithPlacementWeights persists per-opponent adaptive placement weights", async () => {
  const dir = await mkdtemp(join(tmpdir(), "battleships-config-by-opponent-"));
  const configPath = join(dir, "config.json");
  try {
    const config = testConfig();
    const heatmap = {
      counts: zeroWeights(),
      weights: zeroWeights(),
      countsByOpponent: {
        "opponent-a": zeroWeights()
      },
      weightsByOpponent: {
        "opponent-a": zeroWeights()
      },
      totalShots: 12,
      sourceFiles: ["attempt-a.jsonl"]
    };
    heatmap.weights[3][4] = 0.75;
    heatmap.weightsByOpponent["opponent-a"][6][7] = 1;

    const updated = configWithPlacementWeights(config, heatmap, "2026-06-07T00:00:00.000Z");
    await saveConfig(updated, configPath);
    const loaded = await loadConfig(configPath);

    assert.equal(loaded.placement.opponentShotWeights[3][4], 0.75);
    assert.equal(loaded.placement.opponentShotWeightsByOpponent["opponent-a"][6][7], 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("configWithOpponentPlacementWeights uses opponent heatmap with global fallback", () => {
  const config = testConfig();
  config.placement.opponentShotWeights[0][0] = 0.5;
  config.placement.opponentShotWeightsByOpponent["opponent-a"] = zeroWeights();
  config.placement.opponentShotWeightsByOpponent["opponent-a"][2][3] = 1;

  const opponentConfig = configWithOpponentPlacementWeights(config, "opponent-a");
  const fallbackConfig = configWithOpponentPlacementWeights(config, "opponent-b");

  assert.equal(opponentConfig.placement.opponentShotWeights[2][3], 1);
  assert.equal(opponentConfig.placement.opponentShotWeights[0][0], 0);
  assert.equal(fallbackConfig.placement.opponentShotWeights[0][0], 0.5);
});

function testConfig(): StrategyConfig {
  return {
    placement: {
      candidateCount: 200,
      heatmapWeight: 1,
      clusterWeight: 0.15,
      orientationBalanceWeight: 0.2,
      randomJitterWeight: 0.08,
      opponentShotWeights: zeroWeights(),
      opponentShotWeightsByOpponent: {},
      telemetryShotCount: 0,
      telemetrySourceFiles: [],
      updatedAt: null
    },
    shooting: {
      useProbabilityDensity: true,
      huntParity: 2
    }
  };
}

function zeroWeights(): number[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));
}
