import { mintJwt } from "./auth.js";

export const SERVER_URL = "https://intern-battleship-game-server.vercel.app";
export const COMPETITION_ID = "295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c";

export async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const jwt = await mintJwt();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${SERVER_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}
