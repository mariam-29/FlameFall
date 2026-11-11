# Flame Trace backend codebase report

Updated review: November 10, 2026, at commit `aaa8713b1a1ceaf79f5cb21880479899eaf34ebf`. Scope: the source code, checked-in datasets, exports, build script, tests, and documentation in this checkout. Scientific source publications and live provider availability were not independently verified.

## Changes since the previous review

The pulled updates primarily refactor the HTTP application into layers. The scientific library modules, dataset, compiler, request schemas, test file, and package configuration are unchanged relative to commit `9cc1902`, whose application structure matched the previous review. No new public endpoint or scientific dataset expansion was found.

| Area | Updated behavior or structure |
| --- | --- |
| Application setup | `src/app.ts` is now a small application factory that mounts the API router. |
| Configuration | Environment parsing, API-key access, model selection, and timeout access now live in `src/config/env.ts`. |
| Middleware | JSON body parsing and version/ID validation are extracted; a global middleware sets `X-Content-Type-Options: nosniff` on requests reaching it. |
| Routing | The existing four route handlers are registered in `src/routes/api.routes.ts`. |
| Controllers | Evaluation, explanation, exports, and health each have their own controller file. |
| AI service | Gemini HTTP requests, output extraction, timeouts, and model failover live in `src/services/gemini.service.ts`. |
| Provider injection | `createApp({ providerAdapter })` allows an app-specific explanation provider, ahead of the existing global test adapter and default Gemini provider. |
| Timeout configuration | The explanation controller now reads `getAiTimeoutMs()` when calling the provider. This resolves the previous issue where a constant was initialized before `.env` loading. The Gemini service still clamps per-model timeouts to four–five seconds. |

The main improvement is maintainability and the ability to substitute providers per app instance. The existing scientific feature set and API contracts remain intact on source inspection. Runtime compatibility still needs a test run in an environment with installed dependencies.

## 1. Purpose and architecture

This is a scientific evidence exploration backend for Flame Trace / Flame in Freefall, associated with NASA Space Apps. It helps a frontend find relevant combustion research, compare reviewed experiments, assess whether a proposed scenario is covered by available evidence, and explain the results with source citations.

The main request flow is:

`Scenario or question -> scenario resolution -> study ranking -> applicability and comparison -> evidence binding -> JSON response`

The explanation endpoint adds an optional Gemini call, output validation, and a deterministic fallback. Ranking, filtering, and applicability do not require AI.

The stack is Node.js, Express, TypeScript with strict checking, Zod validation, and a Python standard-library data compiler. Vitest supplies the test runner. Data lives in JSON and CSV files; a compiled catalog is loaded, validated, frozen, indexed, and cached in memory. There is no database service.

The current module structure is:

```text
src/server.ts                    HTTP server startup
src/app.ts                       App factory and compatibility exports
src/config/env.ts                Environment configuration helpers
src/routes/api.routes.ts         API route registration
src/middlewares/                 Body limits, JSON parsing, headers, version/ID checks
src/controllers/                 Evaluate, explain, export, and health handlers
src/services/gemini.service.ts   Gemini HTTP integration
src/lib/                        Scientific schemas, catalog, ranking, coverage,
                                comparison, evidence, security, and URL helpers
scripts/build_data.py            Data compiler and integrity checks
```

## 2. Implemented functionality

### Scenario input and resolution

- Accepts structured fields for task, material, geometry, desired outcome, gravity, oxygen, pressure, airflow, and selected runs.
- Supports ISS acrylic, illustrative lunar rover, and custom presets, with compatibility aliases such as `iss_acrylic` and `lunar_rover`.
- Explicit user fields override preset defaults; explicit nulls can clear fields.
- Converts pressure between psia and kPa.
- Includes keyword-based interpretation of questions for tasks, materials, geometry, gravity, outcomes, oxygen, and pressure. This is a limited parser, not general natural-language understanding; it does not extract numeric airflow from questions.
- Reports unset fields and distinguishes an evaluated scenario from browsing or insufficient input.

### Research discovery and ranking

The backend ranks all five investigation profiles using a deterministic relevance score. Base weights are research objective 35, material and geometry 25, conditions and setup 25, and measured outcome 15. Inactive optional criteria are omitted from the denominator.

Results contain criterion breakdowns, reasons, matches and mismatches, data depth, reviewed versus published run counts, research findings, limitations, and source IDs. Ties have deterministic ordering. LUCI is flagged for a lunar-context panel. Scores express research relevance, not a probability or operational safety rating.

Supported research task categories cover materials and ventilation, larger fire spread, smoke detection, and suppression.

### Experiment explorer and comparison

- Filters runs by investigation, platform, material, geometry, flow direction, flow protocol, observed outcome, and initial oxygen bounds.
- Excludes provisional runs by default, with an option to include them.
- Compares two runs across sample/apparatus, experimental conditions, measured quantities, and outcomes.
- Reports confounders such as oxygen, material variant, rod size, orientation, flow protocol, ignition, platform, and repeated use of the same sample.
- Keeps unknown values distinct: two missing measurements do not count as equal.
- Accepts up to ten selected IDs, but the API comparison uses the first two.
- Returns phase sequences separately from experimental runs.

### Applicability and evidence gaps

The backend compares scenario parameters against each study and separately checks whether a single verified run satisfies the entered physical/material/outcome criteria. It does not establish a joint match by combining conditions from different experiments. Missing measurements and nominal or unreported run pressures cannot establish the corresponding joint match.

Numeric matching uses tolerances. For example, the strict match allows oxygen differences up to 0.1 percentage points, pressure differences up to 0.5 kPa, and airflow differences up to 0.2 cm/s. Broader tolerances identify approximate matches. Thus the code's exact-match category means matching within its defined tolerances.

It returns matching run IDs, approximate matches, parameter-level reasons, evidence gaps, and a warning that predictive interpolation is deferred.

### Citations and explanations

Evidence records bind findings to source metadata, original and normalized values, units, measurement basis, page references, and locators. Evaluation responses supply evidence drawers for runs, a figure sequence, and investigations.

`/api/explain` optionally calls Google Gemini with reviewed evidence and requires structured output containing observed findings, applicability limits, missing evidence, and an optional evidence-gap warning. It validates schema, allowed evidence/source IDs, structured numeric values and units, measurement basis, numbers in prose, and inline links. Links are resolved from server-owned source records.

It falls back to deterministic, task-oriented explanation templates when a key is absent, fallback is forced, suspicious input is detected, rate limits are exceeded, the provider fails, or output fails validation. Responses identify the mode and fallback reason. Queries requesting unsupported safe cabin thresholds trigger an evidence-gap warning.

The validator provides useful constraints, but does not prove that every sentence follows from its citations. For example, source and evidence IDs are checked for allowlist membership without enforcing their claimed pairing, and prose numbers are checked against a request-wide set rather than each individual claim's cited evidence.

### Data compilation and exports

The Python compiler reads curated JSON/CSV inputs, normalizes units, checks duplicate IDs and typed references, checks provenance, validates phase ordering and geometric consistency, requires calibration for numeric airflow, and guards against CSV formula injection.

It generates the runtime catalog, verified-run CSV, phase CSV, data dictionary, and manifest. A SHA-256 content hash provides repeatable catalog identity. The backend rejects supplied stale catalog versions and unknown selected record IDs.

URL-state helper functions serialize and parse allowlisted scenario parameters, excluding raw questions and credentials. These are library helpers; there is no saved-scenario or share-link API.

## 3. API surface

| Method | Route | Function |
| --- | --- | --- |
| POST | `/api/evaluate` | Resolve a scenario; return rankings, filtered runs, comparison, applicability, phases, evidence, exclusions, and catalog metadata. |
| POST | `/api/explain` | Recompute context and return a validated AI explanation or deterministic fallback with citations. |
| GET | `/api/export/runs` | Download verified-run CSV. |
| GET | `/api/export/phases` | Download phase CSV. |
| GET | `/api/export/dictionary` | Download the JSON data dictionary. |
| GET | `/api/export/manifest` | Download the JSON manifest. |
| GET | `/api/health` | Return catalog metadata, counts, export paths, and AI configuration readiness. |

The implementation has four route handlers; the parameterized export handler serves four download types. There is no separate catalog, study-detail, run-detail, or search endpoint. The evaluation response supports the explorer use case.

## 4. Current dataset

| Entity | Checked-in count |
| --- | ---: |
| Sources | 9 |
| Investigations | 5 |
| Verified experiment runs | 2 |
| Provisional runs | 0 |
| Phases | 4 |
| Evidence records | 12 |
| Exclusion/review records | 3 |

The five investigations are BASS-II (solid-material burning and ventilation), Saffire-I (larger spacecraft fires), SAME-R (smoke aerosols), FLEX (droplet extinction), and LUCI (lunar-gravity combustion).

Only BASS-II currently has reviewed run rows: `BASSII_O15A` and `BASSII_O15B`. The other investigations have summary or published-reference depth. The published PMMA cohort count of 24 does not mean 24 runnable records are loaded. The exclusion queue documents the remaining cohort reconciliation, missing intermediate figure measurements, and exclusion of LUCI shared-chamber telemetry from isolated-run comparisons.

## 5. Operational controls and limitations

Implemented controls include strict Zod request schemas, a streamed 16 KiB POST body limit, malformed JSON rejection, input cleanup, regex-based prompt-injection detection, response escaping, global nosniff middleware, export filename allowlisting, and structured operational logs. Explain responses use no-store caching. CORS currently permits all origins. The CORS middleware handles preflight before the subsequent security-header middleware by default, so its responses should not be assumed to receive that middleware's header.

The following capabilities are absent from this checkout: user accounts, authentication, authorization roles, admin APIs, data-editing CRUD endpoints, file uploads, persistent user scenarios/history, real-time telemetry ingestion, background jobs, WebSockets, a frontend application, and a predictive fire simulation engine. No Docker or CI workflow configuration was found.

Notable implementation/documentation gaps:

1. Rate limiting applies to AI explanation attempts, returning a normal fallback response rather than HTTP 429. The local counter is process-local, depends on configurable limits, and trusts client-supplied forwarded-IP/upstream-limit headers. It is not a distributed enforcement layer.
2. `.env.example` describes a ten-minute window, while the implementation defaults to 60 seconds. Its `TEAM_PASSCODE` and `TEAM_RATE_LIMIT_MAX` variables have no implementation references.
3. Gemini retries have per-model timeouts capped at five seconds, but no single overall deadline across candidate models. Comments describing a 5.5-second pipeline do not match the current code.
4. The test labeled live Gemini wiring replaces `global.fetch` with a mock. It checks request wiring and response handling, not a successful external Gemini call. Health reports key configuration, not verified provider availability.
5. Catalog version date and generation timestamp are hardcoded to November 14, 2026, even when compiled on another date. They should not be interpreted as actual build time.
6. The custom `.env` loader still overwrites existing environment variables outside tests. It runs at config-module load and again in the application module. The earlier timeout initialization issue is fixed by the new runtime getter.
7. The cached runtime catalog is not reloaded automatically after data edits; changes require recompilation and process restart.
8. There is no centralized JSON error handler or JSON 404 contract for unexpected failures/routes. Deployment and production behavior need verification beyond the existing custom HTTP test harness.

## 6. Verification performed

- Inspected the new configuration, middleware, router, controllers, and Gemini service; checked application wiring and provider injection; compared core libraries, data, compiler, tests, and package configuration against commit `9cc1902`.
- Successfully ran the Python compiler into an isolated validation directory. It reproduced catalog version `2026.11.14-66a836f1` with two verified runs, four phases, and twelve evidence records.
- Found 16 Vitest test cases covering task ranking, presets, comparison, phases, evidence validation, fallback, mocked provider calls, payload limits, version and ID errors, URL state, rate limits, compiler rejection gates, and benchmarks.
- Could not execute TypeScript checks, Vitest, or the application build: dependency installation failed again. The fresh npm log shows `ENOTFOUND` for `registry.npmjs.org`, followed by npm's exit-handler error. Documentation reports 16/16 passing after the refactor; that result was not independently reproduced in this review. The existing 16 tests are unchanged and do not add explicit coverage of the new app-specific provider injection option.

## 7. Overall assessment

This is a substantially implemented, compact research/demo backend with explainable relevance ranking, experiment comparison, provenance-aware data handling, and optional AI synthesis. The update improves code organization, provider substitution, and timeout configuration loading. Its strongest product feature remains making evidence coverage and limitations visible. Its main constraint remains the very small reviewed run dataset. Expanding reviewed data, resolving the remaining configuration mismatches, and verifying tests and deployed behavior would improve confidence before broader use.
