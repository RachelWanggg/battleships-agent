import assert from "node:assert/strict";
import test from "node:test";
import { ShotPlanner } from "../src/shooting.js";

test("ShotPlanner never repeats shots", () => {
  const planner = new ShotPlanner();
  const seen = new Set<string>();

  for (let i = 0; i < 100; i += 1) {
    const shot = planner.nextShot({
      shots: [...seen].map((key) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y, result: "MISS" as const };
      })
    });
    const key = `${shot.x},${shot.y}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }

  assert.equal(seen.size, 100);
});

test("ShotPlanner targets neighbors of unresolved hits", () => {
  const planner = new ShotPlanner();
  const shot = planner.nextShot({
    shots: [{ x: 4, y: 4, result: "HIT" }]
  });

  const distance = Math.abs(shot.x - 4) + Math.abs(shot.y - 4);
  assert.equal(distance, 1);
});
