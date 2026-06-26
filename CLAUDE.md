# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quiz Bowl Buzzer Web Application for human-AI hybrid competitions. Features real-time tossup streaming, bonus scoring, tournament management, and multi-moderator support.

## Commands

```bash
# Development (runs both server and client concurrently)
npm run dev              # Server: localhost:3001, Client: localhost:5173
npm run dev:server       # Backend only (tsx watch)
npm run dev:client       # Frontend only (Vite)
npm run dev:trailscon    # Dev with auto-loaded trails-con dataset preset
npm run dev:qanta26      # Dev with auto-loaded qanta26 dataset preset

# Build
npm run build            # Full build: dist/client/ + dist/server/
npm start                # Production server from dist/server/index.js

# Quality
npm run typecheck        # Type check client + server
npm run lint             # ESLint across .ts/.tsx files
npm test                 # Vitest (server/game/*.test.ts, client/**/*.test.{ts,tsx})
```

API docs available at `http://localhost:3001/api/docs` (Swagger/OpenAPI).

## Architecture

### Monorepo Structure

```
client/   # React 18 + Vite + Tailwind frontend
server/   # Express + Socket.io backend
shared/   # Types, scoring, scheduling utilities shared across client/server
data/     # Tournament datasets (CSV format)
scripts/  # Python utilities for data preparation
runs/     # Game cycle logs (generated at runtime)
```

### Client-Server Communication

Two channels run in parallel:
- **Socket.io** — All real-time game state (`ClientToServerEvents` / `ServerToClientEvents` in `shared/types.ts`)
- **REST API** — Setup operations (datasets, rosters, tournaments, file uploads) proxied via Vite at `/api/*`

### Game State Flow

```
React Component → useGame() hook
  → GameContext.tsx (global state + Socket helpers)
  → Socket.io event emission
  → Server: handlers.ts receives → GameEngine processes
  → Server broadcasts game:state (filtered per role)
  → GameContext updates → re-render
```

### GameEngine State Machine (`server/game/engine.ts`)

Phases: `setup → tossup_ready → tossup_streaming → answer_review → bonus_* → game_over`

Key responsibilities:
- Token-by-token tossup reveal (multimodal: text, img, audio, delay)
- Buzz recording with concurrent AI/human handling
- Score computation with configurable AI deflation modes
- Cycle logging to `runs/` directory
- Question replay with score reversal

### Security: Player State Filtering

`filterStateForPlayer()` in `shared/types.ts` strips moderator-only fields before broadcasting to players:
- `currentTossupAnswer`, `currentBonusPartAnswer`
- `fullTossupText`, `fullTossupTokens`
- `tossupResults`, `bonusResults`

**Never send unfiltered game state to player clients.**

### Data Layer

- `server/data/questions.ts` — CSV/JSON/JSONL parsing, multimodal token regex, packet-relative asset resolution
- `server/data/buzzes.ts` — AI response files (`*.buzz.csv`, `*.bonus.csv`) keyed by model name
- `server/data/evaluation.ts` — Answer matching with inflection (singular/plural) + equivalence sets

### Tournament System

`server/game/tournaments.ts` (~900 lines) manages in-memory tournament state:
- Formats: round-robin, grouped prelims, single/double elimination
- `generateBracket()` + `seedForSlot()` for bracket generation
- `completeGame()` updates standings and unlocks subsequent games
- `shared/schedule-utils.ts` handles constraint-satisfying round ordering

### Key Shared Types (`shared/types.ts`)

- `GameState` — 30+ fields, single source of truth
- `GameConfig` — All game rules (powers, negs, deflation modes, team setup)
- `PlayerType: 'human' | 'ai'`, `AIWeightClass: 'lightweight' | 'midweight' | 'heavyweight'`
- `TossupToken` — `kind: 'text' | 'img' | 'audio' | 'delay'`
- `DeflationMode: 'none' | 'static' | 'weighted'`
- `QuestionOutcome: 'team_a' | 'team_b' | 'dead' | 'negs_only' | 'pending' | 'abstain'`

## Dataset Format

**Tournament format (multi-packet):**
```
tournament_name/
├── ai_roster.csv          # AI player catalog
├── human_roster.csv       # Human players + team assignments
├── packet_N/
│   ├── tossups.csv
│   ├── bonuses.csv
│   ├── img/               # Optional image assets
│   └── audio/             # Optional audio assets
└── responses/
    ├── Author__model.buzz.csv    # Tossup AI responses
    └── Author__model.bonus.csv  # Bonus AI responses
```

**Simple format:** `dataset_name/tossups.csv` + `bonuses.csv` + `responses/`

Multimodal tokens in tossup text use: `<multimodal type="img|audio|delay" hash="..." displayText="...">`

## Development Presets

Set `VITE_AUTOSTART_PRESET` env var (or use `npm run dev:trailscon`) to auto-create a room and start a game on page load. Additional browser tabs can join with `?join=CODE` or get role selection with `?preset=none`.

Dev preset files: `client/src/dev/presets/`

## Important Files

- `shared/types.ts` — All type definitions + `filterStateForPlayer()` + `createInitialGameState()`
- `shared/scoring.ts` — `aiTossupPoints()`, `bonusConsultPoints()` with deflation logic
- `server/game/engine.ts` — GameEngine (600+ lines, core game logic)
- `server/game/handlers.ts` — Socket event registration + `emitStateToRoom()`
- `server/game/tournaments.ts` — Tournament management (900+ lines)
- `client/src/context/GameContext.tsx` — React game state + Socket helpers (~350 lines)
