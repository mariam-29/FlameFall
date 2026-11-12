# Flame Fall Frontend

React + Vite + TypeScript frontend for the Flame Trace / Flame Fall research explorer.

## Requirements

- Node.js 20+
- npm 10+
- FlameFall Express backend running on port `4000` (repository root)

## Run locally

Terminal 1 — repository root (backend):

```bash
npm ci
npm run dev
```

Terminal 2 — frontend folder:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Vite proxies `/api/*` to `http://localhost:4000`. Override the proxy target with `VITE_API_PROXY_TARGET`, or point the browser directly at another API origin with `VITE_API_BASE_URL`.

## Build and type-check

```bash
npm run typecheck
npm run build
npm run preview
```

## Implemented routes

- `/` — cinematic landing page
- `/explore` — scenario builder, deterministic evaluation, explanation, applicability, citation drawer
- `/runs` — catalog run filters, two-run pinning, run evidence and Figure 6.4 sequence
- `/compare` — side-by-side reviewed run comparison and confounder warnings
- `/sources` — searchable source manifest and evidence index
- `/about` — live health, catalog counts, provenance, exclusions and exports

The UI treats the backend response as canonical. It does not infer missing measurements, combine distinct evidence units, or present study relevance as a safety rating. Gemini is optional; reviewed fallback responses remain supported.
