# Backend Implementation Progress

## Checkpoint
- **Branch:** `backend`
- **Latest completed part:** `feat(api): expose Express evaluate, explain, export, and health routes with grounded AI validator`

## Completed
- `3fcadaf` — Initialized Git repository with `main`, `develop`, and `backend` feature branch.
- `5dfaecf` — Scaffolded Express TypeScript backend and shared Zod schemas (`src/lib/schema.ts`, `src/lib/url-state.ts`).
- `391a627` — Built scientific catalog compiler (`scripts/build_data.py`), primary-source records (`O15a`/`O15b` on sample `218m`, `FIG_6_4` with `null` intermediate values, `LUCI` sounding rocket card), and frozen singleton (`src/lib/catalog.ts`).
- `149a5a0` — Implemented scenario resolution, relevance ranking, run comparison, and joint coverage (`src/lib/security.ts`, `src/lib/rank.ts`, `src/lib/coverage.ts`).
- `feat(api): expose Express evaluate, explain, export, and health routes with grounded AI validator` — Added `src/lib/evidence.ts`, `src/app.ts`, and `src/server.ts` with 16 KiB raw stream payload guard, request-scoped citation allowlisting, unit-swap & prose-number validation, injectable provider adapter, and version-matched CSV/manifest exports.

## In progress
- **Part 5 (`test(backend): verify 12+ judging prompts, compiler gates, and HTTP benchmarks`):**
  - Writing `tests/backend.test.ts` and `tests/fixtures/` to verify all 12+ required scenarios through the real Express HTTP handlers.

## Checks and blockers
- Running `npm run typecheck` and `npm run build` on Part 4.

## Next action
- Implement `tests/backend.test.ts`, run `npm test`, and commit Part 5.
