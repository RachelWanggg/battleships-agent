import assert from "node:assert/strict";
import test from "node:test";
import { generateRandomFleet, validateFleet } from "../src/placement.js";
import { FLEET } from "../src/types.js";

test("generateRandomFleet creates complete legal fleets", () => {
  for (let i = 0; i < 1000; i += 1) {
    const fleet = generateRandomFleet();
    assert.equal(fleet.length, FLEET.length);
    assert.deepEqual(validateFleet(fleet), []);
  }
});
