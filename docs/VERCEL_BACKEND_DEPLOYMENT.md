# FlameFall backend on Vercel

The backend deploys from the repository root as Vercel Functions.
`api/[...path].ts` forwards the top-level API routes to `src/index.ts`, and
`api/export/[type].ts` explicitly routes the nested export URLs to the same
Express app. Both entrypoints include the catalog and public export artifacts.
Framework auto-detection is disabled so Vercel cannot select `src/app.ts` as
its entrypoint. Local
`npm run dev` and `npm start` continue to start `src/server.ts` and listen on
`PORT` (4000 by default).

## Vercel project settings

Connect `mariam-29/FlameFall` to a separate Vercel project for the backend, on
the `main` branch. Set:

- Root Directory: `.` (repository root)
- Framework Preset: Other (`vercel.json` sets `framework` to `null`)
- Install Command: `npm ci`
- Build Command: `npm run build:vercel`
- Output Directory: leave unset
- Node.js Version: `24.x`

`vercel.json` already supplies these build settings. `npm run build:vercel`
compiles TypeScript without invoking Python and deploys the committed catalog
and export artifacts. When scientific source data changes, run
`npm run build:data` in an environment with Python 3, review and commit the
regenerated `data/generated/catalog.json` and `public/exports/*` files before
deploying. The regular local build, test, and development commands retain the
data compiler and its integrity checks.

The deployed function includes `data/generated/catalog.json` and
`public/exports/**`. `getCatalog()` loads the catalog from the repository root
and validates it with `CatalogSchema` before serving data.

## Environment variables

No environment variables are required for the backend to serve its API.
Without an AI key, `/api/explain` uses its reviewed deterministic fallback.
Set the following in Vercel only when needed:

| Variable | Required? | Behavior |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Enables live Gemini explanations. `AI_API_KEY` is accepted as a legacy alias. |
| `GEMINI_MODEL` | Optional | Model name; defaults to `gemini-3.1-flash-lite`. |
| `FORCE_FALLBACK_MODE` | Optional | Set `true` to disable live AI even if a key is present; defaults to `false`. |
| `AI_TIMEOUT_MS` | Optional | AI request timeout in milliseconds; defaults to `12000`. |
| `PUBLIC_RATE_LIMIT_MAX` | Optional | Per-instance `/api/explain` request cap; unset/zero disables it. |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | Optional | Per-instance rate-limit window in milliseconds; defaults to `60000`. |

`PORT` only affects the local listener and should not be configured for Vercel.
The in-memory rate limiter is per function instance; use a shared upstream
limiter if a global rate cap is required. Do not store API keys in the
repository or commit `.env` files.

## Routes

The exported Express app retains `GET /api/health`, `POST /api/evaluate`,
`POST /api/explain`, and `GET /api/export/:type` with their existing contracts.
