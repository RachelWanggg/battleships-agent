import { loadConfig, saveConfig } from "./config.js";
import { configWithPlacementWeights, loadOpponentShotHeatmap } from "./placement.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const heatmap = await loadOpponentShotHeatmap();
  const updated = configWithPlacementWeights(config, heatmap);

  await saveConfig(updated);

  console.log("Updated adaptive placement config from telemetry:");
  console.log(JSON.stringify({
    telemetryShotCount: heatmap.totalShots,
    telemetrySourceFiles: heatmap.sourceFiles.length,
    maxCellWeight: Math.max(0, ...heatmap.weights.flat())
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
