import assert from "node:assert/strict";
import test from "node:test";
import { toApiPlacement, toLocalShots } from "../src/play.js";

test("toApiPlacement maps local x/y to server row/col", () => {
  assert.deepEqual(
    toApiPlacement({
      type: "BATTLESHIP",
      orientation: "V",
      x: 3,
      y: 6
    }),
    {
      shipClass: "BATTLESHIP",
      orientation: "VERTICAL",
      startRow: 6,
      startCol: 3
    }
  );
});

test("toLocalShots maps server row/col and SINK outcome", () => {
  assert.deepEqual(
    toLocalShots([
      {
        row: "4",
        col: "7",
        outcome: "SINK",
        sunkShipClass: "DESTROYER"
      }
    ]),
    [
      {
        x: 7,
        y: 4,
        result: "SUNK",
        shipType: "DESTROYER"
      }
    ]
  );
});
