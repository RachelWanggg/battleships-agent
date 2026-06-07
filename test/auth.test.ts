import assert from "node:assert/strict";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { connectAgent } from "../src/auth.js";

const AGENT_ID_PATH = join(process.cwd(), "agent-id.txt");

test("connectAgent reuses saved agent id without starting approval", async () => {
  const previous = await readOptional(AGENT_ID_PATH);

  try {
    await writeFile(AGENT_ID_PATH, "saved-agent-id\n", { mode: 0o600 });
    assert.equal(await connectAgent(), "saved-agent-id");
  } finally {
    if (previous === undefined) {
      await unlink(AGENT_ID_PATH).catch((error: unknown) => {
        if (!isMissingFile(error)) {
          throw error;
        }
      });
    } else {
      await writeFile(AGENT_ID_PATH, previous, { mode: 0o600 });
    }
  }
});

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
