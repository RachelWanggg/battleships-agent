import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "../src/client.js";

test("requestJson mints a fresh JWT for every request", async () => {
  const originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];
  let minted = 0;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "x-request-id": `request-${requests.length}` }
    });
  };

  try {
    await requestJson("GET", "/one", undefined, async () => `jwt-${++minted}`);
    await requestJson("GET", "/two", undefined, async () => `jwt-${++minted}`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(minted, 2);
  assert.equal(getHeader(requests[0], "Authorization"), "Bearer jwt-1");
  assert.equal(getHeader(requests[1], "Authorization"), "Bearer jwt-2");
});

test("requestJson does not set JSON content type for empty-body endpoints", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ ok: true }));
  };

  try {
    await requestJson("POST", "/empty", undefined, async () => "jwt");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(getHeader(captured, "Content-Type"), undefined);
  assert.equal(captured?.body, undefined);
});

test("requestJson sets JSON content type when a body exists", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ ok: true }));
  };

  try {
    await requestJson("POST", "/json", { row: 1, col: 2 }, async () => "jwt");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(getHeader(captured, "Content-Type"), "application/json");
  assert.equal(captured?.body, JSON.stringify({ row: 1, col: 2 }));
});

function getHeader(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    throw new Error("Expected request headers to be a plain record");
  }
  return headers[name];
}
