# Flame Trace frontend handoff

Flame Trace is a research explorer for reviewed spacecraft combustion experiments. The frontend should let users ask a question or build a scenario, see what the collection covers, compare runs, and follow findings to their sources. Keep study relevance, experimental coverage, and operational safety distinct in the interface.

## Start here

- Run `npm ci` and `npm run dev` from the backend repository root with Node.js, npm, and Python available. The development API defaults to `http://localhost:4000`. Use `npm run build` followed by `npm start` for the compiled server, also from the repository root.
- Use a configurable API base URL. The backend exposes browser CORS access, so a separately served frontend can call it during development. Serve the frontend over HTTP during integration testing.
- A Gemini key is optional. Build and test the whole workflow in reviewed fallback mode. For explicit fallback testing set `FORCE_FALLBACK_MODE=true` in the backend environment. For live testing configure `GEMINI_API_KEY` on the backend only and disable forced fallback. `AI_TIMEOUT_MS` defaults to 5500 ms across all Gemini attempts and response reads.
- Open [the design reference](../design/flamefall-ui-reference.html) for the intended screens, layout, and visual assets. [The template](../design/reference.template.html) and [builder](../design/build_reference.py) generate the static reference with an embedded example. If the design folder is absent from your checkout, request it from the project owner. The reference is a snapshot with placeholder controls and some stale values. Use live API responses for scientific data and UI states.
- Canonical contracts live in [schema.ts](../src/lib/schema.ts), the [evaluate controller](../src/controllers/evaluate.controller.ts), the [explain controller](../src/controllers/explain.controller.ts), and the [backend tests](../tests/backend.test.ts). Implement against these files and the API, especially if this guide and the design snapshot differ.

## Screens and data bindings

| Screen | Build | API data |
| --- | --- | --- |
| Research workspace | Question box, task and preset chips, optional scenario fields, ranked investigations, coverage, and explanation. Start in browse state. | `resolved_scenario`, `ranked_investigations`, `applicability`, `joint_match`, and `explanation` |
| Run explorer | Review and filter catalog runs, pin two distinct runs, open each run's evidence, and show the Figure 6.4 sequence separately. | `filtered_runs`, `phases`, and `evidence_drawers` |
| Run comparison | Two run selectors, sectioned table, status per field, and prominent confounders. | `run_comparison` |
| Evidence and sources | Reusable evidence drawer plus a searchable source index. Link each claim to the associated evidence record and original publication. | `citations`, `evidence_map`, `evidence_drawers`, and the export manifest |
| Catalog and exports | Coverage limits, review status, exclusions, provenance, and downloads. | `counts`, `exclusions`, health metadata, and export links |

Preserve the reference layout where useful. Make filters and inputs keyboard accessible. Use text as well as color for statuses, associate form errors with their controls, and restore focus to the citation button when closing the evidence drawer. On narrow screens keep both comparison values readable, with either a scrollable table or stacked labeled values.

## Request flow and frontend state

1. On first load, parse any shared scenario URL. Request `POST /api/evaluate` with that scenario or `{}` for browse. Render the catalog, guidance, and eligible run actions as soon as it returns.
2. Keep form edits separate from the last submitted request. On submit, snapshot the question, scenario, selected runs, and filters. Send that snapshot to `/api/evaluate` and render the returned canonical scenario and deterministic results. An in-flight explanation should leave those results usable.
3. If an explanation is needed, send the same snapshot to `/api/explain` with the `catalog_version` returned by evaluation. Run explorer filters can refresh evaluation without requesting a new explanation on every keystroke. For blank browse, the frontend can skip `/api/explain` and use `applicability.combination_message` as guidance.
4. Cancel superseded requests with `AbortController` or ignore responses that belong to an earlier submission. Use separate loading and error states for evaluation and explanation. If explanation fails, keep the last successful evaluation visible and offer an explanation retry for that snapshot.
5. If either endpoint returns `409`, refresh evaluation without the stale version and retry explanation once with the new version. Revalidate pinned IDs and avoid combining citations across versions.
6. Use the [URL helpers](../src/lib/url-state.ts) for shareable scenarios. The supported query keys are `preset`, `task`, `mat`, `geo`, `out`, `g`, `o2`, `kpa` or `psia`, `flow`, and comma-separated `runs`. Free-text questions, explicit null overrides, and run filters are not round-tripped by these helpers. Keep credentials and raw questions out of share links.

## POST /api/evaluate and POST /api/explain

Both accept a JSON object with the same top-level fields. Send `Content-Type: application/json` and keep the serialized body under 16 KiB.

```json
{
  "scenario": { "preset": "illustrative_lunar_rover" },
  "question": "What evidence carries over to the rover scenario?",
  "selected_run_ids": ["BASSII_O15A", "BASSII_O15B"]
}
```

| Field | Contract |
| --- | --- |
| `scenario.preset` | Use `iss_acrylic_experiment`, `illustrative_lunar_rover`, or `custom_scenario`. Omit the preset on a truly blank browse request. The ISS and rover presets default to the O15 pair. |
| `scenario.task` | `materials_and_ventilation`, `larger_fire_spread`, `smoke_detection`, or `suppression`. |
| `scenario.gravity_regime` | `microgravity`, `lunar_1_6g`, `martian_0_38g`, `earth_1g`, or `partial_g_other`. |
| `scenario.material`, `geometry_shape`, `requested_outcome` | Optional strings up to 80 characters. Use catalog terms for structured selections, such as `PMMA` and `rod`, `cotton_fiberglass` and `flat_sheet`, or `methanol` and `droplet`. A question about generic droplets can resolve geometry while leaving the fuel unset. |
| `scenario.oxygen_pct`, `airflow_cm_s` | Optional numeric values from 0 to 100 and 0 to 500 respectively. Preserve zero. |
| `scenario.pressure_kpa`, `pressure_psia` | Optional absolute pressure, from 0 to 500 kPa or 0 to 75 psia. Send the edited unit. If a preset supplies the other unit, set that companion field to `null` so the backend recomputes it from the edited value. To clear preset pressure entirely, send both as `null`. |
| `question` | Optional text, at most 500 characters. Use the top-level field consistently. The API also accepts `scenario.question`. |
| `selected_run_ids` | Up to 10 IDs, 1 to 64 characters each. Use canonical run IDs from the API. Original IDs such as `O15a` are accepted. The comparison uses the first two entries, so give the user two explicit slots. `compare_run_ids` and nested forms are compatibility inputs. |
| `run_filters` | Optional object. Supported fields are `investigation_id`, `facility_platform`, `material_variant`, `geometry_shape`, `flow_direction`, `flow_protocol`, `observed_outcome`, `min_oxygen_pct`, `max_oxygen_pct`, and `include_provisional`. Use the schema enums for select controls. Filters affect the run list and pair availability. They do not scope the ranked studies or joint coverage check. |
| `catalog_version` | Optional version string from evaluation or health. `data_version` is a compatibility alias. Omit version on a fresh evaluation. |

Omitted scenario fields allow preset or question inference. Explicit `null` on nullable fields clears a value and suppresses inference for that field. Keep explicit blanks distinct from untouched inputs. Keep display-only fields, units, and labels out of the request body because the input schemas reject unknown keys.

### Evaluate response and display rules

- `catalog_version`, `sha256_hash`, `counts`, and `latency_ms` describe the returned catalog and request. Read counts dynamically. `parsed_scenario` aliases `resolved_scenario`.
- `resolved_scenario` includes effective inputs, `preset_applied`, `unset_fields`, `explicit_overrides`, and `scenario_state`. Use `browse_or_insufficient_input` to show browse guidance instead of presenting the first ranking as the user's result. Run browsing and selected-run comparisons are still available.
- `ranked_investigations[]` includes `investigation_id`, `title`, `study_relevance_score`, `data_depth`, reviewed and published counts, `pinned_for_rover_panel`, `research_lead`, and `breakdown`. The lead has `question`, `finding`, `conditions`, `limitation`, and `evidence_ids`. Use the breakdown's `criterion`, `active`, `weight`, `score`, `status`, `unknown`, `reason`, and optional `sub_criteria` for the rationale. A relevance score describes ranking within the catalog.
- `applicability.rows[]` contains `parameter`, `target_display`, `measurement_basis`, and `study_comparisons[]` with `investigation_id`, `study_value_display`, `status`, and `reason`. Display individual statuses as returned. Use `joint_match.combination_tested`, `matching_verified_run_ids`, `approximate_match_run_ids`, and `message` for the overall result. An exact match requires one verified run to satisfy the entered criteria jointly. Report near matches separately. The rover preset has no verified joint match even though LUCI covers simulated lunar gravity.
- `filtered_runs` can include runs unrelated to the research question when no run filters are active. `run_comparison.status` is `compared` or `no_comparable_pair`. In the latter case show `reason` and allow the user to change the pins or filters. In a comparison, iterate `sections.sample_and_apparatus`, `experimental_conditions`, `measured_quantities`, and `outcomes`. Use `display_a`, `display_b`, and `status` for each row. Show `summary_differences` and `confounders` with their severity and message.
- `phases` are ordered records for an experimental sequence. Group by `figure_id`, sort by `ordinal`, and use each phase's `evidence_id`. Preserve null elapsed times or oxygen readings and retain approximate labels from `raw_flow_display`. Open the sequence evidence via `evidence_drawers.FIG_6_4`.
- `evidence_drawers` is keyed by run ID, original run ID, figure ID, or investigation ID. `evidence_map` is keyed by evidence ID. Open the associated drawer when a user clicks a citation or run provenance button.

### Explain response and display rules

The returned envelope includes `catalog_version`, `resolved_scenario` and its `parsed_scenario` alias, `ranked_investigations`, `applicability`, `run_comparison`, `mode`, `provider_mode_detail`, `fallback_reason`, `explanation`, `citations`, `evidence_map`, and `latency_ms`.

```text
explanation
  observed_findings[]       claim
  applicability_limits[]   claim
  missing_evidence[]        claim
  evidence_gap_warning      string or null

claim
  statement
  evidence_ids[]
  source_ids[]
  numeric_facts[]           optional
    label, value, unit, basis, evidence_id
```

- Render only nonempty claim sections. In browse state show `applicability.combination_message` and actions to choose a preset, enter conditions, or ask a question. Blank requests return `fallback_reason: "insufficient_input"` and three empty arrays. Selected-run-only requests can return evidence or a comparison note with `fallback_reason: "selected_runs_only"`.
- Render any nonempty `explanation.evidence_gap_warning` as a prominent text callout above the claims in every mode. This field is server-generated. The reference renderer currently omits the dynamic warning and shows three headings in the empty state. Implement both states in the real UI.
- Use `mode: "live_ai"` with `provider_mode_detail: "live_provider"` for a live AI-assisted label. `simulated_provider_adapter` is a test mode and must be identified as simulated. `reviewed_fallback` with `deterministic_fallback` is a valid HTTP 200 response and should remain readable with its citations.
- Common fallback reasons include `missing_ai_api_key`, `force_fallback_mode_enabled`, `unsupported_safe_threshold_request`, rate-limit reasons, `model_validation_rejected: …`, and `provider_error_or_timeout: …`. Use friendly status copy. Keep diagnostic details out of the user-facing claim text. Recognized safe-threshold questions bypass Gemini.
- Index the returned `citations[]` by `evidence_id` and use those records for the citation buttons in explanation claims. The broader `evidence_map` is context. Some computed catalog or comparison notes have empty ID arrays and should render without a citation control.
- In the drawer show `reviewed_fact`, `source_title`, `doi_or_ntrs_id`, `page_display`, `locator_detail`, `scope`, `quality_flag`, original and normalized value/unit, and `measurement_basis` where available. Build the original-source link from `source_url` and allow HTTP(S) only. Render API strings as text; avoid raw HTML insertion. Some claim strings are already HTML-escaped by the backend. If needed, decode entities once and assign the result to a text node.

### Errors

| Status | Handling |
| --- | --- |
| 400 | Invalid JSON or schema validation. Map `issues[].path` to form controls when present and show a concise message. |
| 404 | Unknown record or investigation IDs, with `unknown_ids` when applicable. Offer to clear stale pins or filters and reload the current catalog. |
| 409 | Stale version. Use `expected_version` and `received_version` for diagnostics and refresh the catalog before retrying. |
| 413 | Payload exceeds 16 KiB. Prompt the user to shorten the request. |
| Network or 5xx | Show a retry for the failed request. Keep a previously loaded evaluation visible if only the explanation failed. |

## Catalog, exports, and scientific display

- `GET /api/health` returns `status`, `catalog_version`, `sha256_hash`, `generated_at`, `counts`, `ai_mode_configured`, and relative `exports` paths. `live_ai_ready` indicates configuration and does not probe Gemini. Use `/api/explain` for actual provider status.
- Download `/api/export/runs` and `/api/export/phases` as CSV and `/api/export/dictionary` and `/api/export/manifest` as JSON. Resolve relative export URLs against the backend base. Export responses expose `Content-Disposition`, `X-Catalog-Version`, `X-Catalog-SHA256`, `X-Runs-Count`, and `X-Phases-Count`. The manifest includes `sources`, `evidence_locators`, and `exclusions`. Use it to power the source index.
- The checked catalog has five investigations, two verified run records, zero provisional runs, five figure phases, and a published PMMA cohort count of 24. Present those as separate counts. The cohort count describes a publication and the five phases describe one sequence.
- O15a and O15b share PMMA sample 218m. The reviewed initial/final oxygen readings are 17.1%/16.7% and 16.7%/15.6% respectively. Run pressure and endpoint airspeed are unreported. The extinction potentiometer setting is not an airspeed. Use API values and preserve measurement basis rather than copying old design snapshot labels.
- Figure 6.4 has 14.8% initial and 13.6% final oxygen. Intermediate oxygen readings are unreported. Preserve approximate airflow and transition-time provenance. Keep the sequence distinct from the O15 run records.
- LUCI is a simulated lunar-gravity shared chamber with acrylic and fabric burning together. Chamber oxygen observations cannot be attributed to one material. Numeric chamber pressure is unreported in the reviewed presentation. Keep LUCI, ISS microgravity, and drop-tower evidence distinct.
- Display `null` as “Unreported” or “Unknown” according to context, and preserve actual zeroes. Keep verified, provisional, approximate, assumed, and published-reference measurements visibly distinguishable. The interface should present study findings with their limitations and evidence-gap warnings, without offering a certified cabin setting.

## Acceptance checks

Run `npm test` and `npm run typecheck` for the backend baseline. At handoff, 31 backend tests pass, including mocked Gemini selection and deadline checks. Live Gemini has not been verified because no key is configured in this workspace. The frontend developer can ship and test reviewed fallback mode independently.

| Scenario | Expected result |
| --- | --- |
| `{}` | Browse guidance, no findings or empty claim headings, no Gemini call. Run browsing remains available. |
| `{"question":"How does gas dilution affect liquid droplets?"}` | FLEX leads, geometry resolves to `droplet`, material stays unset, and reviewed fallback cites `EV_FLEX_SUMMARY` when a key is absent. Its applicability text should discuss the droplet comparison. |
| Ask about methanol droplets, then heptane droplets | The resolved fuel matches the named fuel. The reviewed FLEX methanol comparison is not shown as a heptane result. |
| `{"scenario":{"preset":"iss_acrylic_experiment"}}` | BASS-II leads. O15a and O15b can be compared. Repeated sample history is visible and unknown pressures are marked unknown. |
| `{"scenario":{"preset":"illustrative_lunar_rover"}}` | Show the LUCI reference with shared-chamber scope and a false joint match. Keep unset airflow blank. |
| `{"selected_run_ids":["O15a","O15b"],"run_filters":{"investigation_id":"FLEX"}}` | The run list is empty and comparison returns `no_comparable_pair`. Show the explanation and a way to change the filters or pins. |
| `{"question":"What is the safe cabin oxygen setting for a lunar rover?"}` | Reviewed fallback with `unsupported_safe_threshold_request`. The warning is visible above the claims in the UI. |
| Rapidly submit two different scenarios | The later scenario controls both panels, even when an earlier explanation finishes last. |
| Send a stale version and an unknown pin in separate requests | Confirm `409` refresh handling and `404` stale-pin handling. |
| Open a citation, then download an export | The drawer opens from the corresponding record, focus returns when closed, and the downloaded version matches the displayed catalog. |
| With a Gemini key, rerun the FLEX research question | Verify `provider_mode_detail: "live_provider"` and the FLEX citation. If it falls back, inspect `fallback_reason` and keep the reviewed answer usable. |
