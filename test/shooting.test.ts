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

test("ShotPlanner opens with a high-density center cell", () => {
  const planner = new ShotPlanner();
  const shot = planner.nextShot({ shots: [] });

  assert.deepEqual(shot, { x: 4, y: 4 });
});

test("ShotPlanner extends the known hit line before trying perpendicular cells", () => {
  const planner = new ShotPlanner();
  const shot = planner.nextShot({
    shots: [
      { x: 4, y: 4, result: "HIT" },
      { x: 5, y: 4, result: "HIT" }
    ]
  });

  assert.ok(
    (shot.x === 3 && shot.y === 4) || (shot.x === 6 && shot.y === 4),
    `expected horizontal extension, got ${shot.x},${shot.y}`
  );
});

test("ShotPlanner excludes misses while targeting unresolved hits", () => {
  const planner = new ShotPlanner();
  const shot = planner.nextShot({
    shots: [
      { x: 4, y: 4, result: "HIT" },
      { x: 4, y: 3, result: "MISS" },
      { x: 3, y: 4, result: "MISS" },
      { x: 5, y: 4, result: "MISS" }
    ]
  });

  assert.deepEqual(shot, { x: 4, y: 5 });
});

test("ShotPlanner ignores hits inferred to belong to a sunk ship", () => {
  const planner = new ShotPlanner();
  const shot = planner.nextShot({
    shots: [
      { x: 3, y: 4, result: "HIT" },
      { x: 4, y: 4, result: "SUNK", shipType: "DESTROYER" }
    ]
  });

  assert.notDeepEqual(shot, { x: 2, y: 4 });
  assert.notDeepEqual(shot, { x: 5, y: 4 });
  assert.notDeepEqual(shot, { x: 3, y: 3 });
  assert.notDeepEqual(shot, { x: 3, y: 5 });
});

test("ShotPlanner rejects off-board recorded shots", () => {
  const planner = new ShotPlanner();

  assert.throws(
    () => planner.nextShot({ shots: [{ x: -1, y: 0, result: "MISS" }] }),
    /off-board/
  );
});

test("ShotPlanner throws when no legal shots remain", () => {
  const planner = new ShotPlanner();
  const shots = Array.from({ length: 100 }, (_, index) => ({
    x: index % 10,
    y: Math.floor(index / 10),
    result: "MISS" as const
  }));

  assert.throws(() => planner.nextShot({ shots }), /No legal shots remaining/);
});
