# Prompt Bank

Use this file when starting a new chat, assigning a sub-agent, or checking implementation against the official challenge instructions.

## Official TypeScript Prompt

This is the official Quick Start prompt for the TypeScript implementation. Treat it as the source of truth for auth, endpoints, content-type behavior, and response loop semantics.

```text
Build a Battleships game-playing agent in TypeScript that plays a full match against our server and prints its final score.

SERVER: https://intern-battleship-game-server.vercel.app
COMPETITION (a content hash — use this EXACT value as {comp} in every path): 295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c

AUTH — the "Agent Auth" protocol (OAuth device flow + a fresh signed JWT per request). Docs: https://agent-auth-protocol.com/docs.
- Use the @auth/agent SDK with persistent storage (new AgentAuthClient({ storage })) — discoverProvider(SERVER), then connectAgent({ provider, capabilities }) the FIRST run only, then signJwt({ agentId, capabilities }) per request. Save the returned agentId; on later runs reuse it and SKIP connectAgent (see PERSIST below). See /docs/client-sdk and /docs/integrate-client.
- Call the gameplay REST endpoints below DIRECTLY with your JWT — this server has no capability-execute proxy.
- A human approves the agent ONCE at the printed verification URL. Approve promptly: the device-flow poll gives up after ~5 minutes.
- PERSIST credentials so a human approves only ONCE, even across restarts. Do NOT use MemoryStorage (it drops the keypair on exit, forcing re-approval every run) — give the client a disk-backed Storage: the simplest is KVStorage (exported from @auth/agent) over a tiny JSON-file key-value store — new KVStorage({ get, set, del }), the three methods reading/writing strings in a JSON file; or implement the SDK's full Storage interface over a file yourself. CRUCIAL: connectAgent is the approval step and can trigger a fresh approval, so run it only on the FIRST connect (when you have no saved agentId). Save the agentId it returns; on every later run construct the client with the SAME storage and call signJwt({ agentId, capabilities }) directly — the stored keypair signs offline, no approval. Never reconnect with forceApproval just to refresh.
- Capabilities to request: getCompetitionRules, createAttempt, getCurrentAttempt, placeShips, submitShot, abandonAttempt.
- Send "Authorization: Bearer <jwt>" on every call. Each JWT is single-use — mint a fresh one per request, and pass the FULL capability list to signJwt every time. The server intersects your JWT's capabilities with your grants, so any capability you omit returns 403 CAPABILITY_NOT_GRANTED (this bites getCompetitionRules first, even though it is auto-granted).

GAME — plain REST, no websockets:
- One Attempt = 15 games vs 15 opponents. Board 10x10, coordinates 0-indexed.
- Fleet (one each): CARRIER 5, BATTLESHIP 4, CRUISER 3, SUBMARINE 3, DESTROYER 2.
- 10 seconds per move. An illegal move or a timeout ends the Attempt with HTTP 200 and responseType ATTEMPT_DISQUALIFIED (it is NOT a 4xx).

ENDPOINTS (all under /competitions/295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c, Bearer token on each):
- GET  /rules                          (echoes the competition id back)
- POST /attempts                       NO body -> MOVE_REQUIRED (PLACE_SHIPS)
- POST /attempts/current/placements    body { placements: [{ shipClass, orientation: "HORIZONTAL"|"VERTICAL", startRow, startCol }] }
- POST /attempts/current/shots         body { row, col }
- GET  /attempts/current               (re-read state after a crash)
- POST /attempts/current/abandon       NO body
- Set "Content-Type: application/json" ONLY when you actually send a body. A JSON content-type on an empty body (createAttempt, abandon) makes the server try to parse it and returns 422 MALFORMED_REQUEST.

LOOP on responseType:
- MOVE_REQUIRED: if state.nextRequiredMove == "PLACE_SHIPS" place a legal fleet; else SUBMIT_SHOT, fire one shot.
- GAME_COMPLETED: continue from the embedded .next and keep playing.
- ATTEMPT_COMPLETED: print result.finalScore and stop.
- ATTEMPT_DISQUALIFIED: print reason and stop.

STRATEGY (keep it simple):
- Placement: random but legal (in bounds, no overlaps); re-randomize every game.
- Firing: HUNT on a checkerboard/parity pattern; on a HIT, TARGET orthogonal neighbors until the ship sinks. Never repeat a shot; never fire off-board.

REQUIREMENTS:
- Persist credentials so approval happens once; in the @auth/agent SDK use a disk-backed Storage (never MemoryStorage), save the agentId, and on re-runs call signJwt with it WITHOUT calling connectAgent again — no forced re-approval.
- Mint a fresh single-use JWT per request, always carrying the full capability list.
- Validate your fleet locally before sending it.
- Drive everything off responseType and handle all four variants.
- Print the final score at the end.

API reference: https://intern-battleship-game-server.vercel.app/openapi (live OpenAPI) and the /docs page on this site. Agent Auth docs: https://agent-auth-protocol.com/docs.
```

## Phase Prompts

### Prompt 0: Continue From PRD

```text
Read docs/PRD.md and implement the next highest-priority step for the Battleships agent. Do not start official OAuth or Agent Auth approval. Keep changes scoped, update README only when facts are true, and verify with local typecheck/tests where possible.
```

### Prompt 1: Build Baseline

```text
Implement the baseline TypeScript Battleships agent described in docs/PRD.md and docs/prompts.md: persistent Agent Auth storage, fresh JWT per request, typed REST client, legal random placement, safe non-repeating shooting, responseType-driven game loop, and telemetry. Do not optimize strategy yet. First priority is avoiding disqualification and completing one full Attempt.
```

### Prompt 2: Disqualification Review

Use this in a new chat or sub-agent after baseline code exists.

```text
Review this Battleships agent codebase for disqualification risks. Focus on repeated shots, off-board shots, invalid placements, stale JWT reuse, wrong Content-Type on empty requests, incomplete responseType handling, and timeout risk. Return findings first with file/line references and concrete fixes.
```

### Prompt 3: Improve Shooting

```text
Upgrade src/shooting.ts from basic hunt/target to probability-density targeting. Enumerate legal remaining ship placements, exclude misses, prioritize unresolved hits, score candidate cells, and preserve hard validation against repeated or off-board shots. Add focused tests for shot choice and edge cases.
```

### Prompt 4: Adaptive Placement

```text
Implement adaptive placement from telemetry. Read prior opponent shots, build a heatmap, generate many legal candidate fleets, score by heat exposure plus anti-clustering and orientation balance, then persist updated placement weights in data/config.json. Keep randomization so placement does not become fixed.
```

### Prompt 5: Analyze Attempt

Use this after each completed Attempt.

```text
Analyze the latest telemetry in data/attempts. Summarize finalScore, wins/losses, hit differential, weakest opponents, wasted shots, opponent shot heatmap, and whether config changes improved results. Recommend exactly one or two next strategy changes that are measurable and safe.
```

### Prompt 6: Handoff To New Chat

Use this when context gets long.

```text
We are building a StarSling Battleships agent in /Users/wangruiqi/Projects/Battleships_Agent. Read README.md, docs/PRD.md, docs/progress.html, and docs/prompts.md first. Continue from the current repo state. Do not revert user changes. Do not start official OAuth unless explicitly asked. Prioritize completing the responseType-driven agent loop, avoiding disqualification, telemetry, and closed-loop tuning.
```
