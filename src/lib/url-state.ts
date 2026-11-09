// src/lib/url-state.ts
import {
  GravityRegimeSchema,
  ScenarioInput,
  ScenarioPresetIdSchema,
  TaskTagSchema,
} from "./schema";

const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const PSIA_TO_KPA = 6.894757;

/**
 * Serializes a ScenarioInput into a clean URL query string.
 * Never includes credentials, API keys, tokens, or raw free-text questions.
 */
export function serializeScenarioToSearchParams(
  scenario: ScenarioInput
): string {
  const params = new URLSearchParams();

  if (scenario.preset) {
    params.set("preset", scenario.preset);
  }
  if (scenario.task) {
    params.set("task", scenario.task);
  }
  if (scenario.material && SAFE_ID_REGEX.test(scenario.material)) {
    params.set("mat", scenario.material);
  }
  if (scenario.geometry_shape && SAFE_ID_REGEX.test(scenario.geometry_shape)) {
    params.set("geo", scenario.geometry_shape);
  }
  if (
    scenario.requested_outcome &&
    SAFE_ID_REGEX.test(scenario.requested_outcome)
  ) {
    params.set("out", scenario.requested_outcome);
  }
  if (scenario.gravity_regime) {
    params.set("g", scenario.gravity_regime);
  }
  if (
    typeof scenario.oxygen_pct === "number" &&
    Number.isFinite(scenario.oxygen_pct)
  ) {
    params.set("o2", String(scenario.oxygen_pct));
  }
  if (
    typeof scenario.pressure_kpa === "number" &&
    Number.isFinite(scenario.pressure_kpa)
  ) {
    params.set("kpa", String(scenario.pressure_kpa));
  } else if (
    typeof scenario.pressure_psia === "number" &&
    Number.isFinite(scenario.pressure_psia)
  ) {
    params.set("psia", String(scenario.pressure_psia));
  }
  if (
    typeof scenario.airflow_cm_s === "number" &&
    Number.isFinite(scenario.airflow_cm_s)
  ) {
    params.set("flow", String(scenario.airflow_cm_s));
  }
  if (scenario.selected_run_ids && scenario.selected_run_ids.length > 0) {
    const cleanRuns = scenario.selected_run_ids
      .filter((id) => SAFE_ID_REGEX.test(id))
      .slice(0, 10);
    if (cleanRuns.length > 0) {
      params.set("runs", cleanRuns.join(","));
    }
  }

  return params.toString();
}

function parseFiniteNumberInRange(
  raw: string | null,
  min: number,
  max: number
): number | null {
  if (raw === null || raw.trim() === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

/**
 * Parses only allowlisted query parameters into ScenarioInput.
 * Silently drops any unrecognized or sensitive keys (e.g., api_key, token, auth, question).
 */
export function parseScenarioFromSearchParams(
  searchParams: URLSearchParams | Readonly<URLSearchParams> | string
): ScenarioInput {
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams;

  const result: ScenarioInput = {};

  const rawPreset = params.get("preset");
  const parsedPreset = ScenarioPresetIdSchema.safeParse(rawPreset);
  if (parsedPreset.success) {
    result.preset = parsedPreset.data;
  }

  const rawTask = params.get("task");
  const parsedTask = TaskTagSchema.safeParse(rawTask);
  if (parsedTask.success) {
    result.task = parsedTask.data;
  }

  const rawMat = params.get("mat");
  if (rawMat && SAFE_ID_REGEX.test(rawMat)) {
    result.material = rawMat;
  }

  const rawGeo = params.get("geo");
  if (rawGeo && SAFE_ID_REGEX.test(rawGeo)) {
    result.geometry_shape = rawGeo;
  }

  const rawOut = params.get("out");
  if (rawOut && SAFE_ID_REGEX.test(rawOut)) {
    result.requested_outcome = rawOut;
  }

  const rawG = params.get("g");
  const parsedG = GravityRegimeSchema.safeParse(rawG);
  if (parsedG.success) {
    result.gravity_regime = parsedG.data;
  }

  const o2 = parseFiniteNumberInRange(params.get("o2"), 0, 100);
  if (o2 !== null) {
    result.oxygen_pct = o2;
  }

  const kpa = parseFiniteNumberInRange(params.get("kpa"), 0, 500);
  const psia = parseFiniteNumberInRange(params.get("psia"), 0, 75);
  if (kpa !== null) {
    result.pressure_kpa = kpa;
  } else if (psia !== null) {
    result.pressure_psia = psia;
    result.pressure_kpa = Math.round(psia * PSIA_TO_KPA * 10) / 10;
  }

  const flow = parseFiniteNumberInRange(params.get("flow"), 0, 500);
  if (flow !== null) {
    result.airflow_cm_s = flow;
  }

  const rawRuns = params.get("runs");
  if (rawRuns) {
    const ids = rawRuns
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SAFE_ID_REGEX.test(s))
      .slice(0, 10);
    if (ids.length > 0) {
      result.selected_run_ids = ids;
    }
  }

  return result;
}
