# Battleships Agent

Closed-loop Battleships agent for the StarSling Intern Competition.

The implementation plan, constraints, strategy decisions, telemetry design, and 3-hour execution runbook are tracked in [docs/PRD.md](docs/PRD.md). A phase checklist is available in [docs/progress.html](docs/progress.html), and reusable prompts are stored in [docs/prompts.md](docs/prompts.md).

## Current Status

Baseline and probability-density shooting are implemented. Two full official Attempts have
completed without disqualification.

Current best Attempt:

- Result: `ATTEMPT_COMPLETED`
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
- Legal random fleet placement with local validation.
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

The next phase is adaptive placement from telemetry. The latest Attempt improved from
score `93` to `302`; remaining losses show opponents hitting our fleet quickly, so
placement should use opponent shot heatmaps while keeping randomization.
