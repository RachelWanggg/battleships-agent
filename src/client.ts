import { mintJwt } from "./auth.js";
import type {
  CompetitionRules,
  GameplayEnvelope,
  PlaceShipsRequest,
  SubmitShotRequest
} from "./types.js";

export const SERVER_URL = "https://intern-battleship-game-server.vercel.app";
export const COMPETITION_ID = "295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c";
const BASE_PATH = `/competitions/${COMPETITION_ID}`;
type JwtMinter = () => Promise<string>;

export type ApiResponse<T> = {
  data: T;
  requestId: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly body: string
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  jwtMinter: JwtMinter = mintJwt
): Promise<ApiResponse<T>> {
  const jwt = await jwtMinter();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${SERVER_URL}${path}`, init);
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-vercel-id");

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(`${method} ${path} failed: ${response.status} ${text}`, response.status, requestId, text);
  }

  return {
    data: (await response.json()) as T,
    requestId
  };
}

export class BattleshipsClient {
  constructor(private readonly jwtMinter: JwtMinter = mintJwt) {}

  async getRules(): Promise<ApiResponse<CompetitionRules>> {
    return requestJson<CompetitionRules>("GET", `${BASE_PATH}/rules`, undefined, this.jwtMinter);
  }

  async createAttempt(): Promise<ApiResponse<GameplayEnvelope>> {
    return requestJson<GameplayEnvelope>("POST", `${BASE_PATH}/attempts`, undefined, this.jwtMinter);
  }

  async getCurrentAttempt(): Promise<ApiResponse<GameplayEnvelope>> {
    return requestJson<GameplayEnvelope>("GET", `${BASE_PATH}/attempts/current`, undefined, this.jwtMinter);
  }

  async placeShips(body: PlaceShipsRequest): Promise<ApiResponse<GameplayEnvelope>> {
    return requestJson<GameplayEnvelope>(
      "POST",
      `${BASE_PATH}/attempts/current/placements`,
      body,
      this.jwtMinter
    );
  }

  async submitShot(body: SubmitShotRequest): Promise<ApiResponse<GameplayEnvelope>> {
    return requestJson<GameplayEnvelope>(
      "POST",
      `${BASE_PATH}/attempts/current/shots`,
      body,
      this.jwtMinter
    );
  }

  async abandonAttempt(): Promise<ApiResponse<GameplayEnvelope>> {
    return requestJson<GameplayEnvelope>(
      "POST",
      `${BASE_PATH}/attempts/current/abandon`,
      undefined,
      this.jwtMinter
    );
  }
}

export function parseErrorCode(error: ApiError): string | undefined {
  try {
    const parsed = JSON.parse(error.body) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}
