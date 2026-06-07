import { connectAgent } from "./auth.js";

async function main(): Promise<void> {
  const agentId = await connectAgent();
  console.log(`Agent connected: ${agentId}`);
  console.log("Agent id saved to agent-id.txt");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
