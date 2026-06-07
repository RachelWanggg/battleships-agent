export const CAPABILITIES = [
  "getCompetitionRules",
  "createAttempt",
  "getCurrentAttempt",
  "placeShips",
  "submitShot",
  "abandonAttempt"
] as const;

export async function mintJwt(): Promise<string> {
  throw new Error(
    "Agent Auth is not wired yet. Implement this after local placement and shooting tests pass."
  );
}
