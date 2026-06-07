# Battleships Agent PRD and Execution Runbook

## Objective

Build a closed-loop Battleships agent for the StarSling Intern Competition within a 3-hour official window.

The agent must play one complete Attempt against 15 built-in opponents, record enough telemetry to evaluate itself, and use that telemetry to tune future Attempts for a better final score.

## Current Decision

Use TypeScript and Node.js.

Reasons:

- The official quick start recommends TypeScript for direct `@auth/agent` SDK support.
- Persistent Agent Auth is easier to implement without shelling out to a CLI for every request.
- The game is request/response HTTP, so TypeScript is fast enough and easy to debug.
- The codebase can stay small and readable for evaluation.

## Competition Facts

- Server: `https://intern-battleship-game-server.vercel.app`
- Competition ID: `295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c`
- Board: `10x10`
- Coordinates: zero-indexed, `(0, 0)` is top-left
- Fleet:
  - `CARRIER`: 5
  - `BATTLESHIP`: 4
  - `CRUISER`: 3
  - `SUBMARINE`: 3
  - `DESTROYER`: 2
- One Attempt: 15 Games against 15 fixed opponents
- Move deadline: 10 seconds per move
- Terminal envelopes:
  - `ATTEMPT_COMPLETED`
  - `ATTEMPT_DISQUALIFIED`

## Hard Constraints

- Never repeat a shot.
- Never shoot off-board.
- Never submit an overlapping or off-board fleet.
- Mint a fresh single-use JWT for every request.
- Always include the full granted capability list when signing JWTs.
- Do not set `Content-Type: application/json` for empty-body endpoints.
- Drive the game loop only from `responseType`.
- Stop immediately on `ATTEMPT_COMPLETED` or `ATTEMPT_DISQUALIFIED`.
- Do not start official GitHub OAuth or challenge flow until local code is ready.

## Capabilities

Request and sign with this full capability set:

```text
getCompetitionRules
createAttempt
getCurrentAttempt
placeShips
submitShot
abandonAttempt
```

## API Endpoints

All endpoints are under:

```text
/competitions/295cccc9137b5335cc581d67d655d6fa3b41dac6610dad0e7ed201625523ad8c
```

Endpoints:

```text
GET  /rules
POST /attempts
GET  /attempts/current
POST /attempts/current/placements
POST /attempts/current/shots
POST /attempts/current/abandon
```

References:

- Live API docs: `https://intern-battleship-game-server.vercel.app/openapi`
- OpenAPI JSON: `https://intern-battleship-game-server.vercel.app/openapi/json`
- Agent Auth discovery: `https://intern-battleship-game-server.vercel.app/.well-known/agent-configuration`
- Health check: `https://intern-battleship-game-server.vercel.app/healthz`

## Evaluation Priorities

The codebase should demonstrate:

- A complete working agent.
- Defensive engineering around illegal moves and timeouts.
- Observability: logs, request IDs, per-game results, and scoring summaries.
- Closed-loop tuning: telemetry from prior Attempts changes future behavior.
- Pragmatic strategy choices under a 3-hour constraint.

## Architecture

Planned files:

```text
src/
  auth.ts          Agent Auth setup, persistent storage, JWT signing
  client.ts        Typed REST client, fresh JWT per request
  types.ts         API and game types
  placement.ts     Legal fleet generation and adaptive placement scoring
  shooting.ts      Shot selection strategy
  telemetry.ts     Attempt and game logging
  analyze.ts       Post-Attempt analysis and config updates
  config.ts        Load/save tunable parameters
  play.ts          Main game loop
data/
  attempts/        JSONL/JSON telemetry from Attempts
  config.json      Tunable strategy parameters
docs/
  PRD.md           This document
  progress.html    Phase board, checklist, and prompt bank
  prompts.md       Official prompt and reusable phase prompts
```

Sensitive local files must not be committed:

```text
.agent-auth.json
agent-id.txt
.env
data/attempts/*.jsonl
```

## First Working Agent

The first version only needs to finish a complete Attempt.

Placement:

- Generate a random legal fleet.
- Validate locally before sending.
- Re-randomize every Game.

Shooting:

- HUNT mode uses parity/checkerboard cells.
- TARGET mode fires orthogonal neighbors of known hits.
- Never repeat shots.
- Fall back to any legal untried cell if needed.

Success criteria:

- No disqualification.
- Final response is `ATTEMPT_COMPLETED`.
- Final score is printed.
- Attempt telemetry is saved.

## Stronger Shooting Strategy

Upgrade to probability-density shooting after baseline works.

Algorithm:

- Track every shot as `UNKNOWN`, `MISS`, `HIT`, or `SUNK` when enough information exists.
- Enumerate all legal placements for remaining ship lengths.
- Exclude placements crossing misses.
- If unresolved hits exist, prefer placements that cover them.
- Score each untried cell by number of legal placements that include it.
- Pick the highest-scoring cell.

Expected effect:

- Faster sinking after first hit.
- Better score through more wins and fewer wasted shots.

## Adaptive Placement Strategy

Placement should become self-improving through opponent shot telemetry.

Algorithm:

- Record opponent shots for every Game.
- Build a heatmap of cells opponents frequently target.
- Generate many legal candidate fleets.
- Score each candidate by:
  - Lower exposure to opponent heatmap.
  - Lower ship clustering.
  - Balanced horizontal/vertical orientation.
  - Some randomness to avoid overfitting.
- Select the best candidate each Game.

This is the first closed-loop behavior.

## Telemetry

Log at minimum:

```text
attemptId
gameOrdinal
opponentId
responseType
requestId
moveType
placements
yourShots
opponentShots
gameResult
finalScore
wins
losses
hitDifferential
opponentShipsSunk
agentShipsLost
isNewBest
```

Telemetry should support:

- Debugging disqualification.
- Identifying weak opponents.
- Updating placement heatmaps.
- Comparing strategy configs across Attempts.

## Closed-Loop Workflow

Run cycle:

```text
1. npm run play
2. Save Attempt telemetry
3. npm run analyze
4. Update data/config.json
5. Run another Attempt
6. Compare finalScore and per-opponent outcomes
```

The README should explicitly describe this cycle.

## Official 3-Hour Plan

Before the timer:

- Build local codebase.
- Prepare README.
- Avoid official GitHub OAuth / challenge start.
- Avoid Agent Auth approval until ready to run.

During the official 3 hours:

```text
00:00-00:20  Complete GitHub OAuth, approve Agent Auth, run first Attempt
00:20-00:50  Fix any auth, request, placement, shot, or timeout bugs
00:50-01:30  Improve shooting with probability density
01:30-02:05  Add adaptive placement from opponent heatmaps
02:05-02:35  Run multiple Attempts and update config
02:35-02:50  Clean README, scripts, logs, and examples
02:50-03:00  Final run, commit, push, share repository
```

## Phase Gates and Checklists

The agent should advance phases only when the exit criteria are met. If a phase is blocked, fix the blocker before optimizing strategy.

Current local status:

- Baseline TypeScript code is implemented and covered by local tests.
- `@auth/agent` SDK is installed and the adapter matches the installed SDK surface.
- Agent Auth approval is complete locally; `.agent-auth.json` and `agent-id.txt` exist and are ignored.
- `npm test` passes locally with placement, shooting, REST request, auth reuse, non-blocking telemetry, and mocked response loop coverage.
- Multiple real full Attempts reached `ATTEMPT_COMPLETED` without disqualification.
- Baseline result: finalScore `93`, wins `4`, losses `11`, hitDifferential `-16`, attemptId `948fcf8b-f66e-40c7-83ca-7b31ad6587ec`.
- Probability-density shooting result: finalScore `302`, wins `9`, losses `6`, hitDifferential `20`, attemptId `57ccd74b-d088-4c74-aa48-06d7bd9fa81f`.
- Global adaptive-placement result: finalScore `448`, wins `11`, losses `4`, hitDifferential `67`, attemptId `31935daf-c1c9-4695-bcfe-4d45235ef44a`.
- Per-opponent adaptive-placement result: finalScore `455`, wins `11`, losses `4`, hitDifferential `71`, attemptId `1a9f2b36-dc70-4c44-a95b-49fa65452dd8`.
- Current best result: finalScore `572`, wins `14`, losses `1`, hitDifferential `92`, opponentShipsSunk `74`, agentShipsLost `44`, attemptId `c6f6d443-7bde-4a91-94ff-e25371f96d17`.
- Later tuning experiments scoring `452` and `504` were rejected because they did not beat the current best and increased `agentShipsLost`.

### Phase 0: Local Prep

Entry criteria:

- Challenge docs are understood.
- No official OAuth or approval flow has started.
- Local workspace is available.

Checklist:

- [x] Create PRD/runbook.
- [x] Create README entry point.
- [x] Add ignore rules for credentials and logs.
- [x] Scaffold TypeScript project.
- [x] Add package scripts.

Exit criteria:

- Project can be installed and edited locally.
- There is a clear implementation path for auth, client, strategy, telemetry, and analysis.
- No sensitive files are committed.

### Phase 1: Baseline Agent

Entry criteria:

- TypeScript scaffold exists.
- API endpoints and capability list are encoded in config/constants.

Checklist:

- [x] Persistent Agent Auth storage implemented.
- [x] Agent ID is saved and reused.
- [x] Fresh JWT is minted per request.
- [x] Empty-body endpoints omit JSON content type.
- [x] REST client handles non-2xx and logs `x-request-id`.
- [x] Fleet generator always returns legal placements.
- [x] Shot selector never repeats or shoots off-board.
- [x] Game loop handles `MOVE_REQUIRED`, `GAME_COMPLETED`, `ATTEMPT_COMPLETED`, and `ATTEMPT_DISQUALIFIED`.
- [x] Telemetry file is written.

Exit criteria:

- [x] One full Attempt reaches `ATTEMPT_COMPLETED`.
- [x] Failure reasons are logged clearly enough to fix future runs.
- [x] No known disqualification risk remains in local validation.

### Phase 2: Better Shooting

Entry criteria:

- Baseline Attempt completes or the only blocker is a known server/auth issue.
- Shot history shape is understood from real or mocked responses.
- Baseline score exists for comparison: finalScore `93`.

Checklist:

- [x] Probability-density shot scoring implemented.
- [x] Misses are excluded from candidate placements.
- [x] Known unresolved hits are prioritized.
- [x] Directional targeting works when multiple hits align.
- [x] Fallback always returns a legal untried cell.
- [x] Tests cover edge cases around hit clusters and nearly full boards.

Exit criteria:

- [x] `npm test` passes for shooting logic.
- [x] A full Attempt shows no repeated/off-board shots.
- [x] Telemetry includes enough shot details to compare the strategy.
- [x] Attempt `57ccd74b-d088-4c74-aa48-06d7bd9fa81f` reached score `302`, improving over baseline `93`.

### Phase 3: Adaptive Placement

Entry criteria:

- At least one telemetry file exists, or a fixture can simulate opponent shots.
- Baseline placement is already legal and tested.
- Probability-density shooting is complete and current best score is documented.

Checklist:

- [x] Opponent shot heatmap can be built from telemetry.
- [x] Candidate fleets are scored by heat exposure.
- [x] Candidate scoring also considers clustering and orientation balance.
- [x] Config is loaded and saved deterministically.
- [x] Placement remains randomized within safe bounds.

Exit criteria:

- [x] Prior telemetry changes future placement scores.
- [x] Placement tests still prove no overlap or out-of-bounds ships.
- [x] Config update is documented in telemetry or console output.
- [x] Attempt `31935daf-c1c9-4695-bcfe-4d45235ef44a` reached score `448`, improving over probability-density score `302`.
- [x] Per-opponent adaptive placement later reached current best score `572`.

### Phase 4: Run Loop

Entry criteria:

- Agent can complete an Attempt.
- Analysis script can read telemetry.

Checklist:

- [x] Run Attempt.
- [x] Run analysis.
- [x] Record score, wins, losses, hit differential, and weak opponents.
- [x] Apply at most one or two safe config changes.
- [x] Run another Attempt if time allows.

Exit criteria:

- [x] At least two Attempt results are comparable, or one high-quality complete Attempt is documented if time is short.
- [x] README can truthfully describe the closed-loop behavior.
- [x] Current best remains score `572`; later `452` and `504` experiments were compared and rejected.

### Phase 5: Submit

Entry criteria:

- The agent code is stable enough to submit.
- No known credential/log leak is present.

Checklist:

- [x] Run typecheck.
- [x] Run tests.
- [x] Run final smoke or full Attempt if time permits.
- [x] Update README with actual setup and run commands.
- [x] Commit in coherent increments.
- [x] Push repository.
- [ ] Share repository with the evaluator.

Exit criteria:

- [x] GitHub repository is available and understandable.
- [x] Latest known score/result is documented.
- [x] Reviewer can see the closed-loop design without needing chat history.

## Test Strategy

Testing should protect against disqualification and regressions without consuming the whole 3-hour window.

Required unit tests:

- Fleet placement validation:
  - in bounds
  - no overlap
  - correct ship lengths
  - exactly one of each ship class
- Shot validation:
  - no repeated shots
  - no off-board shots
  - fallback returns a valid cell when board is nearly exhausted
- Shooting strategy:
  - chooses adjacent cells after a hit
  - follows horizontal/vertical direction when hits align
  - ignores known misses
- Config/analysis:
  - heatmap updates from telemetry fixtures
  - config save/load preserves tunable fields

Useful integration tests:

- Mocked game loop with canned envelopes:
  - `MOVE_REQUIRED -> PLACE_SHIPS`
  - `MOVE_REQUIRED -> SUBMIT_SHOT`
  - `GAME_COMPLETED -> next`
  - `ATTEMPT_COMPLETED -> stop`
  - `ATTEMPT_DISQUALIFIED -> stop`
- Mocked client request builder:
  - sends JSON content type only when a body exists
  - asks auth signer for a fresh JWT every request

Real-server tests:

- Health check before official run.
- `GET /rules` after approval.
- One real full Attempt.

Do not spend time on:

- Full end-to-end tests against the live server before approval.
- Snapshot tests for logs.
- UI/browser tests.
- Large simulation framework unless the baseline is already complete.

## Git Strategy

Initialize git only when ready, or earlier if useful for local history.

Suggested commits:

```text
Initialize Battleships agent scaffold
Implement authenticated game client
Add legal placement and baseline shooting
Add probability-based shooting strategy
Add adaptive placement telemetry loop
Document closed-loop tuning workflow
```

Do not commit credentials, JWTs, local auth state, or raw private logs.

## Tooling Plan

Use the built-in tools conservatively.

Codegraph:

- Use Codegraph after files exist to inspect symbol relationships.
- Best use cases:
  - Find call sites before refactors.
  - Review strategy dependencies.
  - Check impact of changing `chooseShot`, `generateFleet`, or API types.
- Do not make Codegraph a runtime dependency.

Sub-agents:

- Use sub-agents only when parallel work is useful.
- Good sub-agent tasks:
  - Review code for disqualification risks.
  - Independently inspect OpenAPI schema.
  - Propose scoring/strategy improvements from telemetry.
  - Draft README language while main implementation continues.
- Avoid sub-agents for the core game loop until baseline is stable.

Karpathy-style skills:

- Treat `multica-ai/andrej-karpathy-skills` as optional inspiration for disciplined iteration.
- Useful principles:
  - Keep an eval loop.
  - Make changes measurable.
  - Prefer simple baselines before complex modeling.
  - Track experiments and compare results.
- Do not spend official time installing or debugging skill tooling unless it is already available and working.

## Definition of Done

Minimum:

- `npm install` works.
- `npm run play` can complete an Attempt after approval.
- `npm run analyze` reads telemetry and updates config.
- README explains setup, auth, running, analysis, and strategy.
- Sensitive files are ignored.

Strong:

- Multiple completed Attempts are logged.
- Score improves or strategy updates are documented.
- Current best score is `572` with attemptId `c6f6d443-7bde-4a91-94ff-e25371f96d17`.
- Disqualification checks are explicit in code.
- Per-opponent weaknesses are visible in telemetry.

## Open Questions

- Whether the official challenge timer starts exactly on GitHub OAuth completion or after a start action.
- Exact OpenAPI response schemas for ship sink events and game results.
- Whether all opponents use deterministic behavior across Attempts.
- Whether leaderboard ranking considers only best Attempt or last Attempt.

These should be resolved only when necessary; they should not block building the local agent.
