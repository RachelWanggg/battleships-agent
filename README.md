# Battleships Agent

Closed-loop Battleships agent for the StarSling Intern Competition.

The implementation plan, constraints, strategy decisions, telemetry design, and 3-hour execution runbook are tracked in [docs/PRD.md](docs/PRD.md). A phase checklist and prompt bank are available in [docs/progress.html](docs/progress.html).

## Current Status

Local TypeScript scaffold is in progress. Placement generation and the first shot planner are implemented with basic tests.

Do not start the official challenge timer, GitHub OAuth, or Agent Auth approval flow until the REST client and game loop are wired.

## Local Setup

```bash
npm install
npm test
```

Useful commands:

```bash
npm run play
npm run analyze
```

`npm run play` currently verifies local core logic and prints a legal random fleet plus the first planned shot. It does not call the official server yet.

## Planned Workflow

```text
npm run play
npm run analyze
```

The agent will play complete Attempts, write telemetry, analyze results, update strategy config, and run again with improved placement and targeting parameters.
