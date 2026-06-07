import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  console.log("Analysis placeholder. Current strategy config:");
  console.log(JSON.stringify(config, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
