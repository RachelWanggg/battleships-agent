# Battleships Agent

Closed-loop Battleships agent for the StarSling Intern Competition.

The implementation plan, constraints, strategy decisions, telemetry design, and 3-hour execution runbook are tracked in [docs/PRD.md](docs/PRD.md). A phase checklist is available in [docs/progress.html](docs/progress.html), and reusable prompts are stored in [docs/prompts.md](docs/prompts.md).

## Current Status

Baseline, probability-density shooting, and adaptive placement are implemented. Two full
official Attempts have completed without disqualification.

Current best Attempt:

- Result: `ATTEMPT_COMPLETED`
- Final score: `448`
- Wins/losses: `11` / `4`
- Hit differential: `67`
- Attempt ID: `31935daf-c1c9-4695-bcfe-4d45235ef44a`

Previous best after probability-density shooting:

- Final score: `302`
- Wins/losses: `9` / `6`
- Hit differential: `20`
- Attempt ID: `57ccd74b-d088-4c74-aa48-06d7bd9fa81f`

Comparison baseline:

- Final score: `93`
- Wins/losses: `4` / `11`
- Hit differential: `-16`
- Attempt ID: `948fcf8b-f66e-40c7-83ca-7b31ad6587ec`

The agent has:

- Persistent Agent Auth storage through `@auth/agent` and a disk-backed KV store.
- Fresh JWT minting per REST request with the full capability list.
- A typed REST client for the Battleships endpoints.
- Adaptive legal fleet placement from prior opponent shot telemetry, with local validation.
- Safe non-repeating probability-density shooting.
- A `responseType`-driven game loop and JSONL telemetry.

Agent Auth has been approved locally. The approved agent id is saved in `agent-id.txt`, and SDK storage is saved in `.agent-auth.json`; both files are ignored and must not be committed.

## Local Setup

```bash
npm install
npm test
```

## Commands

```bash
npm test
npm run auth:connect
npm run play
npm run analyze
```

- `npm test` builds the project and runs local unit/mocked integration tests.
- `npm run auth:connect` starts the Agent Auth approval flow only if no saved `agent-id.txt` exists. Otherwise it reuses the saved agent id.
- `npm run play` calls the real Battleships server, creates or resumes an Attempt, and plays until `ATTEMPT_COMPLETED` or `ATTEMPT_DISQUALIFIED`.
- `npm run analyze` is the placeholder for post-Attempt telemetry analysis.

Agent Auth persists local state in `.agent-auth.json` and the approved agent id in `agent-id.txt`. These files are ignored and must not be committed.

## Official Run Workflow

```text
npm install
npm test
npm run auth:connect
npm run play
npm run analyze
```

After `auth:connect`, approve promptly at the printed verification URL. Then run `npm run play`; final score is printed when the server returns `ATTEMPT_COMPLETED`.

Telemetry is written under `data/attempts/*.jsonl`, which is ignored because it may contain raw attempt details.

## Next Work

Adaptive placement improved the current best from `302` to `448`. The next safe step is
a focused telemetry review of Attempt `31935daf-c1c9-4695-bcfe-4d45235ef44a`, then one
small measurable tuning change if the losses show a clear pattern. The updated placement
config was built from 2,363 de-duplicated opponent shots across 6 saved telemetry files.
