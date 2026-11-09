# Backend Implementation Progress

## Checkpoint
- **Branch:** `backend`
- **Latest completed part:** `feat(eval): implement scenario resolution, relevance ranking, run comparison, and joint coverage`

## Completed
- `3fcadaf` — Initialized Git repository with `main`, `develop`, and `backend` feature branch.
- `5dfaecf` — Scaffolded Express TypeScript backend and shared Zod schemas (`src/lib/schema.ts`, `src/lib/url-state.ts`).
- `391a627` — Built scientific catalog compiler (`scripts/build_data.py`), primary-source records (`O15a`/`O15b` on sample `218m`, `FIG_6_4` with `null` intermediate values, `LUCI` sounding rocket card), and frozen singleton (`src/lib/catalog.ts`).
- `feat(eval): implement scenario resolution, relevance ranking, run comparison, and joint coverage` — Added `src/lib/security.ts`, `src/lib/rank.ts`, and `src/lib/coverage.ts` supporting unified scenario resolution, 35/25/25/15 ranking, `null !== null` comparison, confounder detection (`218m`, flow protocol, platform), and strict single-run `combination_tested` evaluation.

## In progress
- **Part 4 (`feat(api): expose Express evaluate, explain, export, and health routes with grounded AI validator`):**
  - Implementing `src/lib/evidence.ts`, `src/app.ts`, and `src/server.ts`.

## Checks and blockers
- Running `npm run typecheck` to verify `src/lib/security.ts`, `src/lib/rank.ts`, and `src/lib/coverage.ts`.

## Next action
- Implement `src/lib/evidence.ts`, `src/app.ts`, and `src/server.ts`, then commit Part 4.
