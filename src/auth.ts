import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const CAPABILITIES = [
  "getCompetitionRules",
  "createAttempt",
  "getCurrentAttempt",
  "placeShips",
  "submitShot",
  "abandonAttempt"
] as const;

const AUTH_STATE_PATH = join(process.cwd(), ".agent-auth.json");
const AGENT_ID_PATH = join(process.cwd(), "agent-id.txt");
const SERVER = "https://intern-battleship-game-server.vercel.app";

type AgentAuthSdk = {
  AgentAuthClient?: new (options: Record<string, unknown>) => AgentAuthClientLike;
  KVStorage?: new (options: StringKvStore) => unknown;
  createClient?: (options: Record<string, unknown>) => AgentAuthClientLike;
  discoverProvider?: (serverUrl: string) => Promise<unknown>;
  default?: unknown;
};

type AgentAuthClientLike = {
  signJwt?: (input: Record<string, unknown>) => Promise<unknown>;
  signJWT?: (input: Record<string, unknown>) => Promise<unknown>;
  connectAgent?: (input: Record<string, unknown>) => Promise<unknown>;
};

type StringKvStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
};

class JsonFileStringStore implements StringKvStore {
  async get(key: string): Promise<string | null> {
    const data = await this.read();
    return data[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const data = await this.read();
    data[key] = value;
    await this.write(data);
  }

  async del(key: string): Promise<void> {
    const data = await this.read();
    delete data[key];
    await this.write(data);
  }

  async getItem(key: string): Promise<string | null> {
    return this.get(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await this.del(key);
  }

  async delete(key: string): Promise<void> {
    await this.del(key);
  }

  private async read(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(AUTH_STATE_PATH, "utf8")) as Record<string, string>;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async write(data: Record<string, string>): Promise<void> {
    await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
    await writeFile(AUTH_STATE_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }
}

export async function mintJwt(): Promise<string> {
  const client = await createAgentAuthClient();
  const agentId = await readAgentId();
  const signer = client.signJwt ?? client.signJWT;

  if (!signer) {
    throw new Error("@auth/agent client does not expose signJwt/signJWT");
  }

  const signed = await signer.call(client, {
    agentId,
    capabilities: [...CAPABILITIES]
  });

  if (typeof signed === "string") {
    return signed;
  }
  if (isRecord(signed) && typeof signed.jwt === "string") {
    return signed.jwt;
  }
  if (isRecord(signed) && typeof signed.token === "string") {
    return signed.token;
  }

  throw new Error("@auth/agent signJwt returned no JWT string");
}

export async function connectAgent(): Promise<string> {
  const existingAgentId = await readExistingAgentId();
  if (existingAgentId) {
    return existingAgentId;
  }

  const sdk = await importAgentAuthSdk();
  const client = createAgentAuthClient(sdk);
  if (!client.connectAgent) {
    throw new Error("@auth/agent client does not expose connectAgent");
  }
  if (!sdk.discoverProvider) {
    throw new Error("@auth/agent does not export discoverProvider");
  }

  await sdk.discoverProvider(SERVER);
  const result = await client.connectAgent({
    provider: SERVER,
    capabilities: [...CAPABILITIES],
    name: "Battleships Agent"
  });
  const agentId = extractAgentId(result);
  await writeFile(AGENT_ID_PATH, `${agentId}\n`, { mode: 0o600 });
  return agentId;
}

async function createAgentAuthClient(): Promise<AgentAuthClientLike>;
function createAgentAuthClient(sdk: AgentAuthSdk): AgentAuthClientLike;
function createAgentAuthClient(sdk?: AgentAuthSdk): Promise<AgentAuthClientLike> | AgentAuthClientLike {
  if (!sdk) {
    return createAgentAuthClientAsync();
  }
  return createAgentAuthClientFromSdk(sdk);
}

async function createAgentAuthClientAsync(): Promise<AgentAuthClientLike> {
  const sdk = await importAgentAuthSdk();
  return createAgentAuthClientFromSdk(sdk);
}

function createAgentAuthClientFromSdk(sdk: AgentAuthSdk): AgentAuthClientLike {
  const kv = new JsonFileStringStore();
  const options = {
    storage: sdk.KVStorage ? new sdk.KVStorage(kv) : kv,
    allowDirectDiscovery: true,
    onApprovalRequired: (info: Record<string, unknown>) => {
      const completeUrl = typeof info.verification_uri_complete === "string" ? info.verification_uri_complete : undefined;
      const url = typeof info.verification_uri === "string" ? info.verification_uri : undefined;
      const userCode = typeof info.user_code === "string" ? info.user_code : undefined;
      const expiresIn = typeof info.expires_in === "number" ? info.expires_in : undefined;

      console.log("Agent Auth approval required.");
      if (completeUrl) {
        console.log(`Open: ${completeUrl}`);
      } else if (url) {
        console.log(`Open: ${url}`);
      }
      if (userCode) {
        console.log(`Code: ${userCode}`);
      }
      if (expiresIn) {
        console.log(`Expires in: ${expiresIn} seconds`);
      }
    },
    onApprovalStatusChange: (status: unknown) => {
      console.log(`Agent Auth status: ${String(status)}`);
    }
  };

  if (sdk.AgentAuthClient) {
    return new sdk.AgentAuthClient(options);
  }
  if (sdk.createClient) {
    return sdk.createClient(options);
  }
  if (isRecord(sdk.default) && typeof sdk.default.AgentAuthClient === "function") {
    const Client = sdk.default.AgentAuthClient as new (
      options: Record<string, unknown>
    ) => AgentAuthClientLike;
    return new Client(options);
  }

  throw new Error("@auth/agent does not export AgentAuthClient/createClient");
}

async function importAgentAuthSdk(): Promise<AgentAuthSdk> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<AgentAuthSdk>;
    return await dynamicImport("@auth/agent");
  } catch (error: unknown) {
    const cause = error instanceof Error ? `\nCause: ${error.message}` : "";
    throw new Error(
      "Missing @auth/agent. Install it before starting official auth: npm install @auth/agent" +
        cause
    );
  }
}

async function readAgentId(): Promise<string> {
  if (process.env.AGENT_ID) {
    return process.env.AGENT_ID;
  }

  const agentId = await readExistingAgentId();
  if (agentId) {
    return agentId;
  }

  throw new Error(
    "No Agent Auth id found. Set AGENT_ID or run the Agent Auth connection flow before npm run play."
  );
}

async function readExistingAgentId(): Promise<string | undefined> {
  try {
    const agentId = (await readFile(AGENT_ID_PATH, "utf8")).trim();
    return agentId || undefined;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function extractAgentId(result: unknown): string {
  if (isRecord(result)) {
    if (typeof result.agentId === "string") {
      return result.agentId;
    }
    if (isRecord(result.agent) && typeof result.agent.id === "string") {
      return result.agent.id;
    }
    if (typeof result.id === "string") {
      return result.id;
    }
  }
  throw new Error("Agent Auth connection did not return an agent id");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
