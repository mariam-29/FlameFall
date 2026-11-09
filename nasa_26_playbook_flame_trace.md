# NASA 26 PLAN: Flame in Freefall
**2026 NASA Space Apps Hackathon Playbook**

- **Working Title:** Flame Trace
- **Product:** A web dashboard that ranks NASA combustion investigations for a spacecraft scenario, compares individual tests, and shows where their conditions differ from the scenario.
- **Primary User:** An aerospace student or researcher choosing which experiments to investigate for a materials or ventilation question.
- **Hero Question:** What happened when airflow changed around burning acrylic on the ISS, and how much of that evidence carries over to a lunar rover?

**Event Logistics:**
NASA lists the 2026 event for November 14–15. Project submission opens Saturday at 9:00 a.m. and closes Sunday at 11:59 p.m. local time through the Project tab on the team page. Teams have up to six participants. Confirm the registered event's time zone, start time, pitch slot, and any earlier local deadline. This plan assumes four people and two days.

**Verification Status:**
The Resources section at the end covers the core data and planned add-ons. The official challenge's Resources tab did not load during verification. Check it after signing in for additional files or updates. NASA reports the 24-run acrylic cohort. This playbook links the source data and gives an extraction procedure. Downloading, curating, and reviewing the full cohort are implementation tasks.

---

## 1. Main Features

The features below cover the challenge's core job of summarizing, ranking, and interpreting NASA combustion investigations, along with its suggested uses for modeling and safety research. The hero demo moves from discovery to comparison to the lunar rover evidence gap. Link the CSV download and safety research leads from the same results view.

### 1.1 Find, Summarize, and Rank Investigations (High Value)
- **What it does:** Helps a researcher find studies relevant to a materials, fire-spread, smoke-detection, or suppression question and understand why each result ranks.
- **How to implement it:**
  Provide four task chips: **Materials and ventilation**, **Larger fire spread**, **Smoke detection**, and **Suppression**. Add a free-text question field and optional conditions. Every card shows the study objective, fuel and geometry, apparatus, measured outcomes, data depth, source, and best matching or missing conditions.

| Factor | Starting Weight | Rule |
| :--- | :---: | :--- |
| **Research objective** | $35$ | Score direct ($1$), related ($0.5$), or mismatched ($0$) objective using curated tags. |
| **Material and geometry** | $25$ | Score material and shape matches. Label proxy experiments explicitly. |
| **Conditions and setup** | $25$ | Compare requested gravity, oxygen, pressure, and airflow separately. Report matches, unknowns, and differences. |
| **Measured outcome** | $15$ | Score direct measurement ($1$), related measurement ($0.5$), or unavailable ($0$). |

- **Scoring Rules:**
  - Use deterministic subcriterion values of $1$, $0.5$, or $0$.
  - A requested field that a study does not report receives $0$ and an `unknown` flag.
  - A field the user leaves unspecified is omitted for every candidate.
  - Normalize over applicable weights, break ties by direct outcome match and then stable study ID, and publish the weights in Methods.
  - Label the score **study relevance**.
  - Show data depth separately as `verified runs`, `published reference`, or `study summary`.
  - **Expected leaders for test queries:**
    - `BASS-II` for acrylic and airflow (*Materials and ventilation*)
    - `Saffire-I` for larger fabric fires (*Larger fire spread*)
    - `SAME-R` for smoke particle sizes (*Smoke detection*)
    - `FLEX` for gas dilution of droplet flames (*Suppression*)
  - Surface `LUCI` on the rover panel even when `BASS-II` ranks higher on material or airflow. Avoid ranking unrelated studies as if their measurements can be pooled.
- **Ready when:** All four starting investigations have source-backed summaries, and the four task prompts yield different, explainable leaders.

---

### 1.2 Compare Actual NASA Tests (Essential 1)
- **What it does:** Lets users open individual `BASS-II` records, identify what changed and what stayed constant, and inspect the original evidence.
- **How to implement it:**
  - **Data scope:** Begin with two manually verified runs and one published airflow sequence. Aim for $8\text{--}12$ reviewed records from a consistent acrylic cohort. Expand toward NASA's $24$ reported concurrent-flow tests once the source IDs and outcomes reconcile. Publish the actual curated count and distinguish runs from airflow phases.
  - **Run explorer:** Filter by material, geometry and size, airflow direction and protocol, oxygen availability, and observed outcome. Show counts and unit-bearing column headers. Let users pin two runs and open the source record from either row.
  - **Comparison layout:** Divide the comparison into:
    1. Sample and apparatus
    2. Experimental conditions
    3. Measured quantities
    4. Outcomes
    Label each field `same`, `different`, or `unknown`. Summarize the most important differences above the table. Flag confounders such as differing oxygen, material variant, rod size, orientation, or ignition protocol before interpreting an airflow comparison. Show `"no comparable pair"` if the selected filters leave only unmatched runs.
  - **Hero chart:** Use the staged-flow case in `BASS-II` Figure 6.4. NASA describes one test in which airflow was reduced in steps and oxygen went from $14.8\%$ initially to $13.6\%$ at the end. Show both conditions when explaining the observation. Ship a source-linked stage sequence first. Add a quantitative timeline when elapsed time and flow for each point can be verified.
  - **Optional second chart:** Use an oxygen-airflow scatter plot faceted by protocol or rod size. For an endpoint view, pair oxygen and flow from the same event. Keep initial values in a separately labeled view. Separate `quenching`, `blowoff`, `failed sustained ignition`, and `unknown` outcomes. Encode outcome with shapes and labels alongside color. Provide a table equivalent and explain omitted records.
  - **Evidence drawer:** Each point or row opens `run ID`, `sample ID`, `event` or `phase`, `source locator`, `original and normalized units`, and `method`. Show printed page and PDF page if they differ. Export filtered rows with source IDs if time permits.
- **Ready when:** Two verified run records can be selected and traced to their source, and a documented airflow sequence explains the observation and its limits.

---

### 1.3 Check Scenario Applicability (Essential 2)
- **What it does:** Compares oxygen, pressure, and gravity for the selected studies and a proposed crewed environment. The rover view shows what `BASS-II` and `LUCI` each contribute and where the evidence is incomplete.
- **How to implement it:**

| Preset | Inputs and Behavior |
| :--- | :--- |
| **ISS acrylic experiment** | PMMA rod, ISS microgravity, and conditions from a selected verified test. If run pressure is missing, show it as `unreported`. Any separately sourced nominal chamber environment gets its own label. |
| **Illustrative lunar rover** | PMMA, approximately $1/6$ Earth gravity, $34\%$ oxygen, $8.2\text{ psia}$ (about $56.5\text{ kPa}$). Leave airflow unspecified until entered. `BASS-II` gives material and flow evidence. `LUCI` gives a comparison at simulated lunar gravity under a different atmosphere and setup. |
| **Custom scenario** | Allow material, geometry, outcome, gravity, oxygen, absolute pressure, and airflow. State which fields are unset and apply only entered criteria. |

- **Comparison & Normalization Rules:**
  - Each row displays: `target`, `study value or reported range`, `status`, and `reason`.
  - Allowed statuses: `same regime`, `within reported range`, `outside reported range`, `different configuration`, and `unreported`.
  - Show the **combination** separately. For example: *"No verified test in this collection matches this combination."* Two values can each fall within separate ranges while their combination remains untested.
  - **Unit Normalizations:**
    - Normalize oxygen to volume percent ($\%$). Multiply oxygen fractions by $100$ to get percent.
    - Normalize absolute pressure to $\text{kPa}$ with optional $\text{psia}$ display. Convert $\text{psia}$ to $\text{kPa}$ with $\times 6.894757$.
    - Normalize airflow to $\text{cm/s}$. Multiply flow in $\text{m/s}$ by $100$ to get $\text{cm/s}$.
    - Normalize sample dimensions to $\text{mm}$.
    - Preserve original values and precision. Gauge pressure requires a documented reference before conversion.
  - **Measurement Basis & Integrity:**
    - Keep measurement basis explicit: `initial`, `final`, `endpoint`, `modeled`, `assumed`, and `nominal` values have different meanings.
    - Unknown values stay `null`.
    - Track rod `radius` and `diameter` explicitly.
    - Show gravity regime and method, such as `ISS microgravity` or `lunar gravity simulated by rotation`.
    - Separate `ignition`, `sustained burning`, `extinction mechanism`, and `unclassified test end`. Keep each observation tied to its sample, method, and conditions.
    - Show an **evidence gap** when asked for a safe cabin setting or an unsupported threshold.
    - **Defer a predictive model:** NASA research describes cases where partial-gravity flammability can extend beyond ranges suggested by Earth-gravity and microgravity tests. A straight interpolation would hide that possibility.
- **Ready when:** The rover preset distinguishes measured values, study conditions, user assumptions, and missing values. The result shows whether the full combination has been tested.

---

### 1.4 Ask the Dashboard to Interpret Findings (Core)
- **What it does:** Answers a question with cited observations, a short explanation of applicability, and the evidence still needed. The structured comparison remains available during a model outage.
- **How to implement it (5-Step Pipeline):**
  1. **Parse:** Task chips fill known scenario fields. For free text, use synonym matching or structured extraction into the same schema. Show the interpreted scenario and let the user correct it.
  2. **Retrieve:** Recompute ranking and applicability deterministically from the bundled catalog. Select a few relevant verified runs and curated facts. Include the strongest mismatch and the evidence gap. No vector database is required for this sized catalog.
  3. **Explain:** The server-side model gets the validated scenario, results, and an **allowlist of evidence IDs**. Ask for a short structured response with `observed findings`, `applicability limits`, and `missing evidence`. Require a `source ID` / `evidence ID` for each empirical claim. Keep numeric facts and units in structured fields rendered by the app.
  4. **Validate:** Reject unknown citations, invented links, unsupported record IDs, malformed output, and numeric fields outside the provided evidence. Human-review the demo explanations for claim support. Escape all text, limit input and output sizes, and avoid logging raw prompts publicly.
  5. **Fallback:** Use the deterministic comparison and reviewed example explanation on timeout, missing key, or invalid output. Label `live AI` and `reviewed fallback` visibly. Keep the API key server-side and set rate/spend limits using the host or provider. Avoid depending on per-process rate counters for serverless deployment.
- **API Contract:**
  - `POST` a short question or scenario, selected run IDs, and data version.
  - The server resolves IDs and recomputes results.
  - Return: `ranked IDs and reasons`, `coverage rows`, `cited claim objects`, and `live/fallback mode`.
  - The UI renders its structured data as the explanation loads. Share scenario and selected IDs in the URL where practical, with no user credentials in the URL.
- **Ready when:** Live and fallback responses are labeled, claims resolve to the evidence they use, and unsupported thresholds or operational settings produce an evidence-gap response.

---

### 1.5 Export Evidence for Predictive Modeling (Core)
- **What it does:** Gives researchers input and outcome fields in a form they can reuse, including provenance and missing values.
- **How to implement it:** Publish the reviewed `runs.csv` and `phases.csv` alongside the dashboard. Include original and normalized units or a data dictionary, measurement basis, outcome labels, source IDs, and a manifest that resolves source IDs to exact locators. Document exclusions and the catalog version. Use a link to the reviewed full subset for the minimum release. A filtered export is an add-on, along with building a predictive model.
- **Ready when:** Both files download from the results page and match the version and row counts in the app.

---

### 1.6 Surface Research for Fire-Safety Controls and Equipment (Core)
- **What it does:** Shows how findings could inform follow-on research on ventilation and material selection, smoke detection, or suppression.
- **How to implement it:** Add a reviewed research lead to each study card with a `research question`, `experimental finding or measured outcome`, `conditions`, `limitation`, and `evidence IDs`. Use `BASS-II` for material and ventilation, `Saffire-I` for fire scale, `SAME-R` for detection, and `FLEX` for suppression. Keep research leads distinct from operating instructions or equipment specifications. A dedicated equipment explorer is optional.
- **Ready when:** Every task has a cited lead that describes what was tested and what evidence is still needed.

---

## 2. Optional Features
*(Start these after the core demo, deployment, and submission draft work. Estimates are focused person-hours after the core build.)*

- **Sensors and apparatus ($1\text{--}2\text{ h}$):** Explain how a reading was obtained and what kind of fire the apparatus represents. Add a drawer for the camera, radiometer, gas sensor, and airflow measurement details, plus an original diagram of the `BASS-II` duct.
- **Student/researcher depth ($1\text{--}2\text{ h}$):** Give students a plain-language entry point and researchers access to technical details. Add expandable technical detail and a glossary for PMMA, concurrent/opposed flow, quenching, and blowoff.
- **FLEX run explorer ($3\text{--}5\text{ h}$):** Add a second investigation with a full run-level view, focused on suppression. Import a verified slice of the run-level table and compare like fuel, size, pressure, oxygen, and suppressant levels.
- **More Saffire and SoFIE ($2\text{--}4\text{ h}$):** Show larger fires and experiments closer to exploration atmospheres. Add `Saffire-II/III` family cards via the PSI index, a cited `Saffire-VI` result, and a `SoFIE-MIST` study card.
- **DAFT/DAFT-2 and SAME ($2\text{--}4\text{ h}$):** Trace the relationship between background particles, smoke measurements, and detector development.
- **BRE and shared hardware ($2\text{--}4\text{ h}$ for cards):** Show how related experiments use shared hardware or gas flames as proxies for burning materials (`BRE`, `ACME`, `MDCA`, `CFI-G`, `E-FIELD`). Label gas proxies and direct solid burns separately.
- **Spacesuit and cabin context ($1\text{--}2\text{ h}$):** Explain why NASA studies oxygen-enriched, lower-pressure cabin environments (oxygen prebreathe before lower-pressure suit operation). Keep physiology outside the relevance score.
- **$\text{FM}^2$ and partial-gravity modeling ($1\text{ h}$ for a card, model post-hackathon):** Keep `LUCI` in the core as published evidence. Add $\text{FM}^2$ as a study designed for the lunar surface and label evidence depth from actual releases.
- **Earth application ($1\text{--}2\text{ h}$):** Connect space fire research to a sourced use case on Earth (fine water mist).

---

## 3. Shared Implementation & Architecture

**Proposed Stack:** Next.js App Router and TypeScript, CSS, Vega-Lite or an SVG chart, and Python for a CSV-to-JSON validation step. Keep data versioned in the repository. Deploy a standard server build for the live explanation endpoint. Maintain a fallback build or mode with browsing, ranking, comparison, and reviewed examples.

### Repository File Map
| File Path | Responsibility |
| :--- | :--- |
| `data/sources.json` | Source ID, DOI, version, URL, and reuse terms |
| `data/investigations.json` | Study cards, tags, and measurement coverage |
| `data/runs.csv` | One row per reviewed run |
| `data/phases.csv` | One row per verified stage |
| `data/evidence.json` | Curated facts and exact locators |
| `data/generated/catalog.json` | Versioned validated bundle |
| `scripts/build_data.py` | Parse, normalize, validate, and emit JSON |
| `src/app/page.tsx` | Scenario, rank, compare, and evidence views |
| `src/app/api/explain/route.ts` | Server-side model endpoint |
| `src/lib/rank.ts` | Deterministic relevance scoring |
| `src/lib/coverage.ts` | Run and scenario comparisons |
| `src/lib/evidence.ts` | Evidence retrieval and citation validation |
| `src/lib/schema.ts` | Shared request and response validation |

### Data Record Schemas
| Record | Fields to Implement |
| :--- | :--- |
| **Source** | Stable ID, publisher, title, URL, DOI/NTRS ID, version, accessed date, terms. |
| **Investigation** | ID, objective and task tags, fuel class, material and shape, methods, outcomes, overall conditions, limitations, data-depth label, sources. Distinguish study scope from ingested coverage. |
| **Run** | App and original run IDs, investigation and sample IDs, material variant, dimensions, gravity and method, flow direction and protocol, initial/final oxygen, pressure if available, observed outcome and anomalies, evidence IDs, review status. |
| **Phase** | Run ID, ordinal, time if published, flow and oxygen at the stated stage, observation, evidence locator. |
| **Evidence** | ID, source and record IDs, exact page/table/figure/row locator, reviewed paraphrase or fact, original value and unit, normalized value, basis and quality flag. |
| **Scenario** | Task, target material and geometry, requested outcome, optional oxygen/pressure/airflow/gravity, and source of each preset value. |

### Validation Rules
- Enforce unique IDs, existing references (foreign keys), valid units, finite numeric values, correct phase order, and no missing required provenance.
- Preserve source anomalies and explicit `null`s.
- Keep dummy fixtures separate from the released bundle.
- Record data version and ingested counts in the app and repo.

### Build Sequence
1. Data contract
2. Two reviewed runs comparison page
3. Scenario panel
4. Four study cards and ranking
5. Grounded explanation (`POST /api/explain`)
6. Release checks

---

## 4. Validation and Judging Evidence

| Test | Pass Condition |
| :--- | :--- |
| **Source accuracy** | Two reviewers agree on every number and outcome shown in the main demo. Each data point opens the right NASA source and locator. |
| **Missing data** | Null pressure remains `unreported`. An unspecified scenario field stays `unset`. **Unknown values never match each other.** |
| **Protocol integrity** | Staged and fixed flow, opposed and concurrent flow, and initial and endpoint oxygen remain distinguishable. |
| **Ranking** | The four task prompts return their expected leaders and intelligible reasons. Equal inputs produce stable order. |
| **Rover** | The app identifies the `BASS-II` gravity gap and `LUCI`'s simulated lunar gravity and normal-pressure air. It explicitly shows whether any verified experiment covers the joint conditions. |
| **AI** | Evaluate at least $12$ prompts across four goals, rover applicability, unknown fields, unsupported safe-limit requests, adversarial input, and provider failure. Record expected and actual outcomes and whether claims are supported by the citations. |
| **Product** | Verify desktop, phone, keyboard use, accessible chart table, logged-out public links, slow connection, and disabled AI. |
| **Demo** | Ask a teammate unfamiliar with the UI to reach the evidence and report the gap. Time the actual run if you plan to mention speed. |

---

## 5. Team and Schedule

| Owner | First Handoff |
| :--- | :--- |
| **Science and Data** | Two approved run rows, one airflow sequence, rover reference, source manifest. |
| **Front end and UX** | Comparison page with real rows, citation drawer, scenario controls. |
| **Ranking and AI (Backend)** | Validated data contract, ranking and coverage functions, API response schema and evals. |
| **Product and Release** | Deployment, project entry draft, attribution, second source review, recorded demo and submission. |

### Timeline
- **Day 1, Hours 0–3:** Lock scenario and data contract. Extract and review the first two runs. Deploy a skeleton and verify the public URL.
- **Day 1, Hours 3–7:** Complete real-data comparison and scenario coverage. Add four study cards with cited research leads and the `LUCI` reference. If extraction stalls, keep the verified subset.
- **Day 1, Hours 7–11:** Add ranking explanations and live AI. Write the project page and pitch. Freeze the first usable dataset and publish the reviewed CSVs.
- **Day 2, First 3 Hours:** Run evals, correct scientific wording, check mobile and accessibility, and record a fallback demo.
- **4 Hours Before Cutoff:** Freeze features, capture screenshots, fill submission fields, rehearse, and verify links from a private browser.
- **2 Hours Before Cutoff:** Submit with buffer and confirm the portal status.

---

## 6. Pitch and Submission

### Thirty-Second Rehearsal
- **0–5 s:** Ask *"How does airflow affect an acrylic fire in space?"* Show the question and identify NASA data.
- **5–11 s:** Show `BASS-II` ranked first and explain its material, airflow, and outcome match.
- **11–19 s:** Open two verified runs or the published airflow sequence. Point to the observation and click through to the source.
- **19–26 s:** Switch to the lunar rover. Show the oxygen, pressure, and gravity gaps and the `LUCI` reference.
- **26–30 s:** Close with the next research question: *Which experiment covers both lunar gravity and the proposed atmosphere?*

---

## 7. Resources and Data Extraction Guide

### Core Datasets and Research References
| Source | Contents | How to Use It |
| :--- | :--- | :--- |
| **BASS-II, PSI-25** | ISS test metadata and archived media. Dataset DOI `10.60555/4qc4-de67`. | Core run explorer. Start with concurrent-flow acrylic rods. Save PSI version, access date, and original filenames. |
| **BASS-II Technical Report (`NASA/TM-20210011385`)** | Section 6.1 covers concurrent-flow acrylic rods. Figure 6.4 follows one staged-flow test ($14.8\%$ initial $\text{O}_2$ to $13.6\%$ end $\text{O}_2$). Appendix A contains run matrices, including Olson's Table A.5 (printed pp. 69–71 and pp. 110–111). | First extraction path and fallback if PSI download controls are unavailable. Inspect `O15a` and `O15b` in Table A.5 as candidate records for the first comparison. |
| **Concurrent-flow PMMA Paper** | Defines the 24-test cohort and distinguishes low-flow quenching and high-flow blowoff. Also describes short drop-tower tests. | Verify protocols and outcome labels. Keep drop-tower and ISS records separate. |
| **Saffire-I, PSI-98** | Larger cotton-fiberglass sample burned aboard uncrewed Cygnus. DOI `10.60555/0115-1z43`. | Rank for fire growth and scale. Compare sample and enclosure context with `BASS-II`. |
| **SAME-R, PSI-101** | Smoke particle measurements and reflight final report. DOI `10.60555/2np7-jv14`. (Original SAME: `PSI-102`). | Rank for smoke detection. Keep particle-size evidence distinct from flame-spread outcomes. |
| **FLEX, PSI-69** | Run-level table with fuel, pressure, gas composition, droplet size, burn time, and test end. DOI `10.60555/mbq8-0451`. | Rank for gas suppression of liquid-droplet flames. Good candidate for a second run explorer. |
| **LUCI (`NASA NTRS 20250010653`)** | Published results from an acrylic rod and cotton-fiberglass fabric burned in normal-pressure air at simulated lunar gravity. Both burned in the same chamber. | Rover comparison reference. Label the simulated gravity, atmosphere, and shared chamber. Keep chamber-level readings at chamber level. |
| **Exploration Atmosphere (`NTRS 20240003211`)** | NASA describes a recommended exploration atmosphere of $8.2\text{ psia}$ ($56.5\text{ kPa}$) and $34\%$ oxygen. | Source for an illustrative lunar rover preset. Label it as a scenario assumption. |
| **Saffire-VI and SOFIE-MIST** | `Saffire-VI` has published preliminary results for larger samples, including PMMA. `SOFIE-MIST` studies solid ignition and suppression under varying pressure, oxygen, flow, and heating. | Optional evidence cards for atmosphere and scale. |
| **Partial-Gravity Fire Safety Review** | Documents why flammability under partial gravity may differ from both Earth-gravity and microgravity results. | Use for the scenario limitation and the decision to defer interpolation. |