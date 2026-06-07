import { generateRandomFleet, validateFleet } from "./placement.js";
import { ShotPlanner } from "./shooting.js";

async function main(): Promise<void> {
  const placements = generateRandomFleet();
  const errors = validateFleet(placements);
  if (errors.length > 0) {
    throw new Error(`Generated illegal fleet:\n${errors.join("\n")}`);
  }

  const planner = new ShotPlanner();
  const firstShot = planner.nextShot({ shots: [] });

  console.log("Local agent core is ready.");
  console.log(JSON.stringify({ placements, firstShot }, null, 2));
  console.log("Next step: wire Agent Auth and REST game loop.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
