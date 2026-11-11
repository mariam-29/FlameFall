# Flame Trace — Frontend Integration & Handoff Guide

This document provides the complete integration contract for the **Flame Trace (Flame in Freefall)** Node.js + Express backend. For session checkpoints and commit history, see [docs/BACKEND_PROGRESS.md](file:///d:/حاسبات ومعلومات/مشاريع/Nasa/docs/BACKEND_PROGRESS.md).

---

## 1. Runnable Commands

| Command | Description |
| :--- | :--- |
| `npm run build:data` | Compiles `data/*.json` and `data/*.csv` into `data/generated/catalog.json` and `public/exports/*` with SHA-256 integrity hashing |
| `npm run dev` | Starts the Express server in watch mode on `http://localhost:4000` (configurable via `PORT`) |
| `npm run typecheck` | Runs `tsc --noEmit` strict TypeScript validation |
| `npm run build` | Compiles the data catalog and builds production JavaScript to `dist/` |
| `npm start` | Runs the compiled production server (`node dist/server.js`) |
| `npm test` | Compiles data and executes the 15-test Vitest verification & benchmark suite |
| `npm run verify:all` | Runs `build:data`, `typecheck`, `test`, and `build` end-to-end |

---

## 2. Two-Speed Architecture Overview

The backend is designed around a strict **two-speed decoupled architecture**:

1. **`POST /api/evaluate` (Fast Deterministic Engine — `< 1 ms` warm core):**
   - Resolves presets (`iss_acrylic_benchmark`, `illustrative_lunar_rover`, `custom`) and free-text query hints into a single canonical `resolved_scenario`.
   - Computes deterministic `0–100` study relevance rankings with transparent category breakdowns, omitted-field weight renormalization, and explicit `unknown` field flags (`0` points + `unknown: true`).
   - Filters candidate runs, computes 2-run side-by-side comparison (`O15a` vs. `O15b` on shared clear `9.525 mm` diameter PMMA sample `218m`), and evaluates **joint multi-condition applicability** (`combination_tested`).
   - Returns pre-resolved evidence drawer records and investigation-scoped reference cards (including the **LUCI** rotating New Shepard sounding-rocket reference card at `~0.16g`).
2. **`POST /api/explain` (Grounded AI Synthesis with Automatic Reviewed Fallback):**
   - Builds a request-scoped `CitationAllowlist` from the deterministic evaluation.
   - Calls the configured LLM provider with an `AbortController` timeout (`5.5 s`), or uses an injected provider adapter in tests.
   - Validates every model claim against the request-scoped allowlist, checking `evidence_id`, `source_id`, inline links/DOIs, unit-swap errors (e.g., `8.2 kPa` vs `8.2 psia`), and unsupported prose numbers.
   - Automatically falls back to deterministic, source-bound `reviewed_fallback` synthesis when no API key is configured, when the provider times out or fails, when rate-limited, or when any model claim fails validation.

---

## 3. API Endpoints & Real Request/Response Examples

### 3.1 `POST /api/evaluate`

#### Request
```http
POST /api/evaluate HTTP/1.1
Content-Type: application/json

{
  "question": "What did NASA observe when airflow changed around burning acrylic on the ISS, and which parts of that evidence carry over to an illustrative lunar rover?",
  "scenario": {
    "preset": "illustrative_lunar_rover",
    "task": "materials_and_ventilation",
    "material": "PMMA",
    "geometry_shape": "rod"
  },
  "selected_run_ids": ["O15a", "O15b"]
}
```

#### Response (`200 OK`)
```json
{
  "catalog_version": "2026.11.14-66a836f1",
  "sha256_hash": "66a836f15a94c518f0a4bc7213e4710bfbe772e2b54fd3183d08276511ff21bb",
  "browse_mode": false,
  "resolved_scenario": {
    "preset": "illustrative_lunar_rover",
    "task": "materials_and_ventilation",
    "material": "PMMA",
    "geometry_shape": "rod",
    "characteristic_length_mm": 9.525,
    "gravity_regime": "lunar_1_6g",
    "oxygen_pct": 34,
    "pressure_kpa": 56.5,
    "pressure_psia": 8.2,
    "airflow_cm_s": null,
    "diluent_gas": "N2",
    "requested_outcome": "spread_rate",
    "selected_run_ids": ["BASSII_O15A", "BASSII_O15B"],
    "sanitized_question": "What did NASA observe when airflow changed around burning acrylic on the ISS, and which parts of that evidence carry over to an illustrative lunar rover?",
    "is_blank_query": false,
    "inferred_fields": ["requested_outcome"]
  },
  "ranked_investigations": [
    {
      "investigation_id": "BASS-II",
      "title": "Burning and Suppression of Solids - II (BASS-II)",
      "record_type": "psi_investigation",
      "study_relevance_score": 81.9,
      "research_lead": "Best match for materials and ventilation on PMMA rods; provides ISS microgravity forced-flow data, while lunar 1/6g and 56.5 kPa remain untested in BASS-II.",
      "published_run_count": 24,
      "reviewed_run_count": 2,
      "source_ids": ["SRC_BASSII_TM2021", "SRC_BASSII_PSI25", "SRC_PMMA_NTRS2015"],
      "breakdown": [
        {
          "category": "research_objective",
          "base_weight": 35,
          "normalized_weight": 35,
          "raw_match": 1,
          "weighted_points": 35,
          "status": "matched",
          "unknown": false,
          "reason": "Investigation directly targets task 'materials_and_ventilation'."
        }
      ]
    }
  ],
  "luci_reference_card": {
    "visible": true,
    "investigation_id": "LUCI",
    "title": "Lunar Gravity Combustion Investigation (LUCI) on Blue Origin New Shepard",
    "facility_type": "Sounding_Rocket_New_Shepard",
    "gravity_regime": "lunar_1_6g",
    "published_run_count": 1,
    "reviewed_run_count": 0,
    "summary": "Rotating Blue Origin New Shepard sounding-rocket payload (~0.16g) burning a 4 mm diameter (2 mm radius) PMMA rod and cotton-fiberglass fabric simultaneously in normal-pressure air (21% O2, 101.3 kPa).",
    "shared_chamber_oxygen_caveat": "Both the 4 mm acrylic rod and cotton-fiberglass fabric burned simultaneously inside a single shared chamber; oxygen sensor readings reflect shared-chamber consumption and cannot be attributed to a single sample.",
    "source_ids": ["SRC_LUCI_NTRS2025"],
    "evidence_ids": ["EV_LUCI_OVERVIEW", "EV_LUCI_SHARED_O2"]
  },
  "applicability": {
    "combination_tested": false,
    "matching_run_ids": [],
    "combination_message": "Individual parameters appear across separate studies, but NO single verified run in the catalog tests all requested conditions and outcome jointly.",
    "rows": [
      { "parameter": "material", "requested_display": "PMMA", "status": "tested_in_catalog", "matching_run_ids": ["BASSII_O15A", "BASSII_O15B"], "matching_investigation_ids": ["BASS-II", "LUCI"] },
      { "parameter": "gravity_regime", "requested_display": "lunar_1_6g", "status": "tested_in_published_reference_only", "matching_run_ids": [], "matching_investigation_ids": ["LUCI"] },
      { "parameter": "oxygen_pct", "requested_display": "34.0 %", "status": "not_tested_in_catalog", "matching_run_ids": [], "matching_investigation_ids": [] },
      { "parameter": "pressure_kpa", "requested_display": "56.5 kPa (8.2 psia)", "status": "not_tested_in_catalog", "matching_run_ids": [], "matching_investigation_ids": [] }
    ]
  }
}
```

---

### 3.2 `POST /api/explain`

#### Request
```http
POST /api/explain HTTP/1.1
Content-Type: application/json

{
  "question": "What is the safe cabin oxygen limit for a lunar rover based on these tests?",
  "scenario": {
    "preset": "illustrative_lunar_rover"
  },
  "selected_run_ids": ["O15a", "O15b"]
}
```

#### Response (`200 OK`)
```json
{
  "catalog_version": "2026.11.14-66a836f1",
  "mode": "reviewed_fallback",
  "provider_status": "not_configured",
  "fallback_reason": "provider_key_absent",
  "observed_findings": [
    {
      "statement": "In BASS-II candidate runs O15a and O15b on shared sample 218m (a clear 9.525 mm diameter PMMA rod), tests started at 17.5 % oxygen with 10 cm/s and 9 cm/s initial opposing flow, and flow changed during the test.",
      "evidence_ids": ["EV_O15A_TABLE_A5", "EV_O15B_TABLE_A5"],
      "source_ids": ["SRC_BASSII_TM2021"]
    }
  ],
  "applicability_limits": [
    {
      "statement": "The illustrative lunar rover atmosphere (lunar 1/6g, 34 % oxygen, 56.5 kPa / 8.2 psia) has combination_tested = false across the verified catalog.",
      "evidence_ids": ["EV_LUCI_OVERVIEW", "EV_O15A_TABLE_A5"],
      "source_ids": ["SRC_LUCI_NTRS2025", "SRC_BASSII_TM2021"]
    }
  ],
  "missing_evidence": [
    {
      "statement": "Run-level ambient pressure for BASS-II runs O15a and O15b is null (unreported in Table A.5), and intermediate elapsed times and flow velocities in Figure 6.4 are null.",
      "evidence_ids": ["EV_O15A_PRESSURE_UNREPORTED", "EV_FIG64_PHASES"],
      "source_ids": ["SRC_BASSII_TM2021"]
    }
  ],
  "evidence_gap_warning": "EVIDENCE GAP WARNING: The catalog contains experimental research observations (such as BASS-II Figure 6.4 quenching at 13.6 % oxygen in ISS microgravity on a 6.35 mm black PMMA rod), NOT certified spacecraft cabin safety thresholds or operational flammability limits. Do not infer a safe cabin oxygen setting from these records.",
  "citations_resolved": []
}
```

---

### 3.3 Export & Health Endpoints

- `GET /api/health` — Returns `status`, `catalog_version`, `sha256_hash`, `counts`, `ai_mode_configured`, and export URLs.
- `GET /api/export/runs` — Downloads the verified run records as CSV.
- `GET /api/export/phases` — Downloads the reviewed Figure 6.4 airflow stages as CSV.
- `GET /api/export/dictionary` — Downloads the data dictionary with units, null semantics, and count definitions.
- `GET /api/export/manifest` — Downloads the catalog version, catalog SHA-256, counts, sources, evidence, and exclusions.

Export responses expose `Content-Disposition`, `X-Catalog-Version`, `X-Catalog-SHA256`, `X-Runs-Count`, and `X-Phases-Count` to browser clients.

---

## 4. Frontend Two-Speed Integration Snippet

```ts
import {
  parseScenarioFromSearchParams,
  serializeScenarioToSearchParams,
} from "../src/lib/url-state";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function loadFlameTraceWorkspace(searchString: string, question?: string) {
  // 1. Parse URL search params into a clean ScenarioInput (strips secrets/prompts)
  const scenario = parseScenarioFromSearchParams(searchString);

  // 2. Sync canonical URL state back to the browser address bar
  const cleanQuery = serializeScenarioToSearchParams(scenario);
  window.history.replaceState(null, "", cleanQuery ? `?${cleanQuery}` : window.location.pathname);

  // 3. Speed 1 (Immediate): Call deterministic /api/evaluate (< 5 ms)
  const evalResponse = await fetch(`${API_BASE}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      scenario,
      selected_run_ids: scenario.selected_run_ids,
    }),
  });
  if (!evalResponse.ok) {
    throw new Error(`Evaluate failed with HTTP ${evalResponse.status}`);
  }
  const evaluation = await evalResponse.json();

  // Render deterministic UI immediately (rankings, LUCI card, run comparison, applicability matrix)
  renderDeterministicUI(evaluation);

  // 4. Speed 2 (Async): Call grounded /api/explain in parallel without blocking the UI
  fetch(`${API_BASE}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      catalog_version: evaluation.catalog_version,
      question,
      scenario,
      selected_run_ids: scenario.selected_run_ids,
    }),
  })
    .then((res) => res.json())
    .then((explanation) => {
      renderGroundedExplanationPanel(explanation);
    })
    .catch((err) => {
      console.error("Explain request failed:", err);
    });
}
```

---

## 5. Three-Axis Release Status

| Status Axis | Current State | Details |
| :--- | :--- | :--- |
| **1. Software Readiness** | **COMPLETE (100% Passing)** | Express + TypeScript backend, Python data compiler (`scripts/build_data.py`), frozen in-memory catalog (`version=2026.11.14-66a836f1`), deterministic ranker, run comparison, joint coverage matrix, strict citation validator, and all 15 Vitest test suites pass (`npm run verify:all` exit code `0`). |
| **2. Scientific Review Queue** | **2 Verified Candidate Runs + 4 Verified Phases + 5 Investigations** | `BASSII_O15A` (`O15a`) and `BASSII_O15B` (`O15b`) on shared sample `218m` (`9.525 mm` diameter clear PMMA rod) and `FIG_6_4` (`4` phases, `14.8%` to `13.6%` O2) are `verified` from `NASA/TM-20210011385`. Remaining 22 runs in the 24-test concurrent-flow PMMA cohort (`NTRS 20150008961`) and PSI raw telemetry files require PSI login / human reviewer sign-off and are logged in `data/exclusions.json`. |
| **3. Live-Provider Verification** | **Simulated Adapter Verified (`simulated_provider_adapter`); Live Key Optional** | Controlled provider adapter tests verify both `live_ai` pass-through on valid citations and automatic `reviewed_fallback` rejection on hallucinated DOIs, out-of-scope evidence IDs, unit swaps, and unsupported prose numbers. Live Gemini API execution requires setting `GEMINI_API_KEY` in the runtime environment. |
