// src/lib/coverage.ts
import { findRunByIdOrOriginal } from "./catalog";
import {
  ApplicabilityRow,
  Catalog,
  ComparisonFieldRow,
  ComparisonStatus,
  ConfounderWarning,
  ResolvedScenario,
  Run,
  RunComparisonResult,
  RunExplorerFilter,
  ScenarioApplicabilityResult,
  ScenarioInput,
  ScenarioPresetId,
} from "./schema";
import { parseScenarioFromFreeText, stripControlAndHtml } from "./security";

const PSIA_TO_KPA = 6.894757;

function normalizePresetId(
  preset: ScenarioPresetId | null | undefined
): ScenarioPresetId | null {
  if (!preset) return null;
  if (
    preset === "iss_acrylic" ||
    preset === "iss_acrylic_benchmark" ||
    preset === "iss_acrylic_experiment"
  ) {
    return "iss_acrylic_experiment";
  }
  if (preset === "lunar_rover" || preset === "illustrative_lunar_rover") {
    return "illustrative_lunar_rover";
  }
  if (preset === "custom" || preset === "custom_scenario") {
    return "custom_scenario";
  }
  return preset;
}

export function resolveScenario(
  rawScenario: ScenarioInput | undefined,
  topLevelQuestion: string | null | undefined,
  topLevelSelectedRunIds: string[] | undefined,
  catalog: Catalog
): ResolvedScenario {
  const input: ScenarioInput = { ...(rawScenario ?? {}) };
  if (input.preset !== undefined) {
    input.preset = normalizePresetId(input.preset);
  }
  if (input.compare_run_ids !== undefined && input.selected_run_ids === undefined) {
    input.selected_run_ids = input.compare_run_ids;
  }
  if (topLevelQuestion !== undefined && input.question === undefined) {
    input.question = topLevelQuestion;
  }
  if (topLevelSelectedRunIds !== undefined && input.selected_run_ids === undefined) {
    input.selected_run_ids = topLevelSelectedRunIds;
  }

  // Record which keys were explicitly supplied (including explicit null to clear a preset field)
  const explicitOverrides = new Set<string>();
  if (rawScenario) {
    for (const [key, val] of Object.entries(rawScenario)) {
      if (val !== undefined) {
        if (key === "compare_run_ids") {
          explicitOverrides.add("selected_run_ids");
        } else {
          explicitOverrides.add(key);
        }
      }
    }
  }
  if (topLevelQuestion !== undefined) explicitOverrides.add("question");
  if (topLevelSelectedRunIds !== undefined) explicitOverrides.add("selected_run_ids");

  const presetId: ScenarioPresetId | null = normalizePresetId(input.preset);

  // Start from an empty base and apply preset defaults if requested
  const base: ScenarioInput = {
    preset: presetId,
    task: null,
    question: null,
    material: null,
    geometry_shape: null,
    requested_outcome: null,
    gravity_regime: null,
    oxygen_pct: null,
    pressure_kpa: null,
    pressure_psia: null,
    airflow_cm_s: null,
    selected_run_ids: [],
  };

  if (presetId === "iss_acrylic_experiment") {
    const requestedRuns = input.selected_run_ids ?? [];
    const primaryRun =
      (requestedRuns.length > 0
        ? findRunByIdOrOriginal(requestedRuns[0], catalog)
        : undefined) ??
      findRunByIdOrOriginal("BASSII_O15A", catalog) ??
      catalog.runs[0];

    base.task = "materials_and_ventilation";
    base.material = "PMMA";
    base.geometry_shape = primaryRun?.geometry_shape ?? "rod";
    base.requested_outcome = primaryRun?.observed_outcome ?? "quenching";
    base.gravity_regime = primaryRun?.gravity_regime ?? "microgravity";
    base.oxygen_pct = primaryRun?.initial_oxygen_pct ?? 15.6;
    base.pressure_kpa = primaryRun?.pressure_kpa ?? null; // Unreported at run level in Table A.5
    base.pressure_psia = primaryRun?.pressure_psia ?? null;
    base.airflow_cm_s = primaryRun?.airflow_cm_s ?? 3.0;
    base.selected_run_ids =
      requestedRuns.length > 0
        ? requestedRuns
        : ["BASSII_O15A", "BASSII_O15B"];
  } else if (presetId === "illustrative_lunar_rover") {
    base.task = "materials_and_ventilation";
    base.material = "PMMA";
    base.geometry_shape = "rod";
    base.requested_outcome = null;
    base.gravity_regime = "lunar_1_6g";
    base.oxygen_pct = 34.0;
    base.pressure_psia = 8.2;
    base.pressure_kpa = 56.5; // 8.2 psia * 6.894757 = 56.537 -> 56.5 kPa
    base.airflow_cm_s = null; // Explicitly unset until supplied
    base.selected_run_ids =
      input.selected_run_ids && input.selected_run_ids.length > 0
        ? input.selected_run_ids
        : ["BASSII_O15A", "BASSII_O15B"];
  }

  // Apply explicit edits and cleared fields (null) over the preset base
  const merged: ScenarioInput = { ...base };
  for (const key of explicitOverrides) {
    const k = key as keyof ScenarioInput;
    (merged as Record<string, unknown>)[k] = input[k];
  }

  // Sanitize question if present
  if (typeof merged.question === "string") {
    merged.question = stripControlAndHtml(merged.question);
  }

  // Apply free-text interpretation for fields not explicitly set or cleared
  const afterFreeText = parseScenarioFromFreeText(
    merged.question,
    merged,
    explicitOverrides
  );

  // Normalize custom pressure-unit equivalence (psia <-> kPa)
  if (
    afterFreeText.pressure_kpa !== null &&
    afterFreeText.pressure_kpa !== undefined &&
    (afterFreeText.pressure_psia === null ||
      afterFreeText.pressure_psia === undefined)
  ) {
    afterFreeText.pressure_psia =
      Math.round((afterFreeText.pressure_kpa / PSIA_TO_KPA) * 10) / 10;
  } else if (
    afterFreeText.pressure_psia !== null &&
    afterFreeText.pressure_psia !== undefined &&
    (afterFreeText.pressure_kpa === null ||
      afterFreeText.pressure_kpa === undefined)
  ) {
    afterFreeText.pressure_kpa =
      Math.round(afterFreeText.pressure_psia * PSIA_TO_KPA * 10) / 10;
  }

  // Ensure identical effective fields when user enters explicit PMMA + rod + lunar_1_6g without a task chip
  if (
    !afterFreeText.task &&
    !explicitOverrides.has("task") &&
    afterFreeText.material?.toUpperCase() === "PMMA" &&
    afterFreeText.geometry_shape === "rod"
  ) {
    afterFreeText.task = "materials_and_ventilation";
  }

  // Determine whether the scenario is blank / browse mode
  const hasAnyCriterion = Boolean(
    afterFreeText.preset ||
      afterFreeText.task ||
      (afterFreeText.question && afterFreeText.question.trim().length > 0) ||
      afterFreeText.material ||
      afterFreeText.geometry_shape ||
      afterFreeText.requested_outcome ||
      afterFreeText.gravity_regime ||
      (afterFreeText.oxygen_pct !== null &&
        afterFreeText.oxygen_pct !== undefined) ||
      (afterFreeText.pressure_kpa !== null &&
        afterFreeText.pressure_kpa !== undefined) ||
      (afterFreeText.airflow_cm_s !== null &&
        afterFreeText.airflow_cm_s !== undefined)
  );

  const unsetFields: string[] = [];
  if (!afterFreeText.material) unsetFields.push("material");
  if (!afterFreeText.geometry_shape) unsetFields.push("geometry_shape");
  if (!afterFreeText.requested_outcome) unsetFields.push("requested_outcome");
  if (!afterFreeText.gravity_regime) unsetFields.push("gravity_regime");
  if (afterFreeText.oxygen_pct === null || afterFreeText.oxygen_pct === undefined) {
    unsetFields.push("oxygen_pct");
  }
  if (
    afterFreeText.pressure_kpa === null ||
    afterFreeText.pressure_kpa === undefined
  ) {
    unsetFields.push("pressure_kpa");
  }
  if (
    afterFreeText.airflow_cm_s === null ||
    afterFreeText.airflow_cm_s === undefined
  ) {
    unsetFields.push("airflow_cm_s");
  }

  return {
    ...afterFreeText,
    scenario_state: hasAnyCriterion
      ? "evaluated"
      : "browse_or_insufficient_input",
    preset_applied: presetId,
    unset_fields: unsetFields,
    explicit_overrides: Array.from(explicitOverrides),
  };
}

export function filterRuns(filters: RunExplorerFilter, catalog: Catalog): Run[] {
  return catalog.runs.filter((run) => {
    if (!filters.include_provisional && run.review_status !== "verified") {
      return false;
    }
    if (
      filters.investigation_id &&
      run.investigation_id !== filters.investigation_id
    ) {
      return false;
    }
    if (
      filters.facility_platform &&
      run.facility_platform !== filters.facility_platform
    ) {
      return false;
    }
    if (
      filters.material_variant &&
      !run.material_variant
        .toLowerCase()
        .includes(filters.material_variant.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.geometry_shape &&
      run.geometry_shape.toLowerCase() !== filters.geometry_shape.toLowerCase()
    ) {
      return false;
    }
    if (
      filters.flow_direction &&
      run.flow_direction !== filters.flow_direction
    ) {
      return false;
    }
    if (filters.flow_protocol && run.flow_protocol !== filters.flow_protocol) {
      return false;
    }
    if (
      filters.observed_outcome &&
      run.observed_outcome !== filters.observed_outcome
    ) {
      return false;
    }
    if (
      filters.min_oxygen_pct !== undefined &&
      filters.min_oxygen_pct !== null &&
      (run.initial_oxygen_pct === null ||
        run.initial_oxygen_pct < filters.min_oxygen_pct)
    ) {
      return false;
    }
    if (
      filters.max_oxygen_pct !== undefined &&
      filters.max_oxygen_pct !== null &&
      (run.initial_oxygen_pct === null ||
        run.initial_oxygen_pct > filters.max_oxygen_pct)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * CRITICAL NULL RULE:
 * Unknown or null values NEVER match each other.
 * If valA is null/unknown OR valB is null/unknown -> status is ALWAYS "unknown".
 */
export function compareScalarValues(
  valA: string | number | null | undefined,
  valB: string | number | null | undefined,
  numericTolerance = 1e-6
): ComparisonStatus {
  if (
    valA === null ||
    valA === undefined ||
    valB === null ||
    valB === undefined ||
    valA === "unknown" ||
    valB === "unknown" ||
    valA === "unreported" ||
    valB === "unreported"
  ) {
    return "unknown";
  }

  if (typeof valA === "number" && typeof valB === "number") {
    if (!Number.isFinite(valA) || !Number.isFinite(valB)) {
      return "unknown";
    }
    return Math.abs(valA - valB) <= numericTolerance ? "same" : "different";
  }

  return String(valA).trim().toLowerCase() === String(valB).trim().toLowerCase()
    ? "same"
    : "different";
}

function formatDisplayValue(
  val: string | number | null | undefined,
  unit?: string
): string {
  if (val === null || val === undefined || val === "unreported") {
    return "unreported";
  }
  if (val === "unknown") {
    return "unknown";
  }
  return unit ? `${val} ${unit}` : String(val);
}

export function compareRuns(
  runAId: string | null | undefined,
  runBId: string | null | undefined,
  catalog: Catalog,
  activeFilteredRuns?: readonly Run[]
): RunComparisonResult {
  if (!runAId || !runBId || runAId.toLowerCase() === runBId.toLowerCase()) {
    return {
      status: "no_comparable_pair",
      reason:
        "No comparable pair selected. Please pin two distinct run records.",
      run_a_id: runAId ?? null,
      run_b_id: runBId ?? null,
      summary_differences: [
        "No comparable pair selected. Please pin two distinct run records.",
      ],
      confounders: [],
      sections: {
        sample_and_apparatus: [],
        experimental_conditions: [],
        measured_quantities: [],
        outcomes: [],
      },
    };
  }

  const runA = findRunByIdOrOriginal(runAId, catalog);
  const runB = findRunByIdOrOriginal(runBId, catalog);

  if (!runA || !runB) {
    return {
      status: "no_comparable_pair",
      reason:
        "One or both requested run IDs do not exist in the verified catalog.",
      run_a_id: runAId,
      run_b_id: runBId,
      summary_differences: [
        "One or both requested run IDs do not exist in the verified catalog.",
      ],
      confounders: [],
      sections: {
        sample_and_apparatus: [],
        experimental_conditions: [],
        measured_quantities: [],
        outcomes: [],
      },
    };
  }

  // If run_filters were applied and excluded one or both pinned runs, return no_comparable_pair
  if (activeFilteredRuns) {
    const allowedSet = new Set(activeFilteredRuns.map((r) => r.run_id));
    if (!allowedSet.has(runA.run_id) || !allowedSet.has(runB.run_id)) {
      return {
        status: "no_comparable_pair",
        reason: `Active run filters excluded one or both pinned runs (${runA.original_run_id}, ${runB.original_run_id}), leaving no defensible comparable pair.`,
        run_a_id: runA.run_id,
        run_b_id: runB.run_id,
        summary_differences: [
          `Active filters excluded one or both pinned runs (${runA.original_run_id}, ${runB.original_run_id}).`,
        ],
        confounders: [],
        sections: {
          sample_and_apparatus: [],
          experimental_conditions: [],
          measured_quantities: [],
          outcomes: [],
        },
      };
    }
  }

  const sampleAndApparatus: ComparisonFieldRow[] = [
    {
      field_key: "investigation_id",
      label: "Investigation",
      unit: null,
      run_a_value: runA.investigation_id,
      run_b_value: runB.investigation_id,
      display_a: runA.investigation_id,
      display_b: runB.investigation_id,
      status: compareScalarValues(runA.investigation_id, runB.investigation_id),
    },
    {
      field_key: "original_run_id",
      label: "Original NASA Run ID",
      unit: null,
      run_a_value: runA.original_run_id,
      run_b_value: runB.original_run_id,
      display_a: `${runA.original_run_id} (${runA.run_id})`,
      display_b: `${runB.original_run_id} (${runB.run_id})`,
      status: compareScalarValues(runA.original_run_id, runB.original_run_id),
    },
    {
      field_key: "facility_platform",
      label: "Facility & Platform",
      unit: null,
      run_a_value: runA.facility_platform,
      run_b_value: runB.facility_platform,
      display_a: runA.facility_platform,
      display_b: runB.facility_platform,
      status: compareScalarValues(runA.facility_platform, runB.facility_platform),
    },
    {
      field_key: "sample_id",
      label: "Physical Sample ID",
      unit: null,
      run_a_value: runA.sample_id,
      run_b_value: runB.sample_id,
      display_a: runA.sample_id,
      display_b: runB.sample_id,
      status: compareScalarValues(runA.sample_id, runB.sample_id),
    },
    {
      field_key: "material_variant",
      label: "Material Variant",
      unit: null,
      run_a_value: runA.material_variant,
      run_b_value: runB.material_variant,
      display_a: runA.material_variant,
      display_b: runB.material_variant,
      status: compareScalarValues(runA.material_variant, runB.material_variant),
    },
    {
      field_key: "geometry_shape",
      label: "Geometry Shape",
      unit: null,
      run_a_value: runA.geometry_shape,
      run_b_value: runB.geometry_shape,
      display_a: runA.geometry_shape,
      display_b: runB.geometry_shape,
      status: compareScalarValues(runA.geometry_shape, runB.geometry_shape),
    },
    {
      field_key: "rod_radius_mm",
      label: "Rod Radius (mm)",
      unit: "mm",
      run_a_value: runA.rod_radius_mm,
      run_b_value: runB.rod_radius_mm,
      display_a: formatDisplayValue(runA.rod_radius_mm, "mm"),
      display_b: formatDisplayValue(runB.rod_radius_mm, "mm"),
      status: compareScalarValues(runA.rod_radius_mm, runB.rod_radius_mm, 1e-3),
    },
    {
      field_key: "rod_diameter_mm",
      label: "Rod Diameter (mm)",
      unit: "mm",
      run_a_value: runA.rod_diameter_mm,
      run_b_value: runB.rod_diameter_mm,
      display_a: formatDisplayValue(runA.rod_diameter_mm, "mm"),
      display_b: formatDisplayValue(runB.rod_diameter_mm, "mm"),
      status: compareScalarValues(
        runA.rod_diameter_mm,
        runB.rod_diameter_mm,
        1e-3
      ),
    },
  ];

  const experimentalConditions: ComparisonFieldRow[] = [
    {
      field_key: "gravity_regime",
      label: "Gravity Regime",
      unit: null,
      run_a_value: runA.gravity_regime,
      run_b_value: runB.gravity_regime,
      display_a: `${runA.gravity_regime} (${runA.gravity_method})`,
      display_b: `${runB.gravity_regime} (${runB.gravity_method})`,
      status: compareScalarValues(runA.gravity_regime, runB.gravity_regime),
    },
    {
      field_key: "flow_direction",
      label: "Airflow Direction",
      unit: null,
      run_a_value: runA.flow_direction,
      run_b_value: runB.flow_direction,
      display_a: runA.flow_direction,
      display_b: runB.flow_direction,
      status: compareScalarValues(runA.flow_direction, runB.flow_direction),
    },
    {
      field_key: "flow_protocol",
      label: "Airflow Protocol",
      unit: null,
      run_a_value: runA.flow_protocol,
      run_b_value: runB.flow_protocol,
      display_a: runA.flow_protocol,
      display_b: runB.flow_protocol,
      status: compareScalarValues(runA.flow_protocol, runB.flow_protocol),
    },
    {
      field_key: "ignition_method",
      label: "Ignition Protocol",
      unit: null,
      run_a_value: runA.ignition_method,
      run_b_value: runB.ignition_method,
      display_a: formatDisplayValue(runA.ignition_method),
      display_b: formatDisplayValue(runB.ignition_method),
      status: compareScalarValues(runA.ignition_method, runB.ignition_method),
    },
    {
      field_key: "pressure_kpa",
      label: "Absolute Pressure (kPa)",
      unit: "kPa",
      run_a_value: runA.pressure_kpa,
      run_b_value: runB.pressure_kpa,
      display_a:
        runA.pressure_kpa !== null
          ? `${runA.pressure_kpa} kPa (${runA.pressure_basis})`
          : "unreported",
      display_b:
        runB.pressure_kpa !== null
          ? `${runB.pressure_kpa} kPa (${runB.pressure_basis})`
          : "unreported",
      status: compareScalarValues(runA.pressure_kpa, runB.pressure_kpa, 0.1),
    },
  ];

  const measuredQuantities: ComparisonFieldRow[] = [
    {
      field_key: "airflow_cm_s",
      label: "Calibrated Airflow Velocity (cm/s)",
      unit: "cm/s",
      run_a_value: runA.airflow_cm_s,
      run_b_value: runB.airflow_cm_s,
      display_a: formatDisplayValue(runA.airflow_cm_s, "cm/s"),
      display_b: formatDisplayValue(runB.airflow_cm_s, "cm/s"),
      status: compareScalarValues(runA.airflow_cm_s, runB.airflow_cm_s, 0.05),
    },
    {
      field_key: "raw_flow_display",
      label: "Raw Fan / Flow Display",
      unit: null,
      run_a_value: runA.raw_flow_display,
      run_b_value: runB.raw_flow_display,
      display_a: formatDisplayValue(runA.raw_flow_display),
      display_b: formatDisplayValue(runB.raw_flow_display),
      status: compareScalarValues(runA.raw_flow_display, runB.raw_flow_display),
    },
    {
      field_key: "raw_oxygen_display",
      label: "Raw Oxygen Sensor Display",
      unit: null,
      run_a_value: runA.raw_oxygen_display,
      run_b_value: runB.raw_oxygen_display,
      display_a: formatDisplayValue(runA.raw_oxygen_display),
      display_b: formatDisplayValue(runB.raw_oxygen_display),
      status: compareScalarValues(
        runA.raw_oxygen_display,
        runB.raw_oxygen_display
      ),
    },
    {
      field_key: "initial_oxygen_pct",
      label: "Initial Oxygen (vol %)",
      unit: "%",
      run_a_value: runA.initial_oxygen_pct,
      run_b_value: runB.initial_oxygen_pct,
      display_a: formatDisplayValue(runA.initial_oxygen_pct, "%"),
      display_b: formatDisplayValue(runB.initial_oxygen_pct, "%"),
      status: compareScalarValues(
        runA.initial_oxygen_pct,
        runB.initial_oxygen_pct,
        0.05
      ),
    },
    {
      field_key: "final_oxygen_pct",
      label: "Final Oxygen (vol %)",
      unit: "%",
      run_a_value: runA.final_oxygen_pct,
      run_b_value: runB.final_oxygen_pct,
      display_a: formatDisplayValue(runA.final_oxygen_pct, "%"),
      display_b: formatDisplayValue(runB.final_oxygen_pct, "%"),
      status: compareScalarValues(
        runA.final_oxygen_pct,
        runB.final_oxygen_pct,
        0.05
      ),
    },
    {
      field_key: "endpoint_oxygen_pct",
      label: "Endpoint Oxygen (vol %)",
      unit: "%",
      run_a_value: runA.endpoint_oxygen_pct,
      run_b_value: runB.endpoint_oxygen_pct,
      display_a: formatDisplayValue(runA.endpoint_oxygen_pct, "%"),
      display_b: formatDisplayValue(runB.endpoint_oxygen_pct, "%"),
      status: compareScalarValues(
        runA.endpoint_oxygen_pct,
        runB.endpoint_oxygen_pct,
        0.05
      ),
    },
  ];

  const outcomes: ComparisonFieldRow[] = [
    {
      field_key: "observed_outcome",
      label: "Observed Outcome",
      unit: null,
      run_a_value: runA.observed_outcome,
      run_b_value: runB.observed_outcome,
      display_a: runA.observed_outcome,
      display_b: runB.observed_outcome,
      status: compareScalarValues(runA.observed_outcome, runB.observed_outcome),
    },
    {
      field_key: "anomalies",
      label: "Source Anomalies & Notes",
      unit: null,
      run_a_value: runA.anomalies,
      run_b_value: runB.anomalies,
      display_a: formatDisplayValue(runA.anomalies),
      display_b: formatDisplayValue(runB.anomalies),
      status: compareScalarValues(runA.anomalies, runB.anomalies),
    },
  ];

  // Confounder Detection
  const confounders: ConfounderWarning[] = [];

  if (runA.facility_platform !== runB.facility_platform) {
    confounders.push({
      type: "facility_platform",
      severity: "critical",
      message: `Platform confounder: ${runA.original_run_id} ran in '${runA.facility_platform}' while ${runB.original_run_id} ran in '${runB.facility_platform}'. Never pool short drop-tower or sounding-rocket tests with ISS microgravity runs.`,
    });
  }

  if (runA.sample_id === runB.sample_id) {
    confounders.push({
      type: "repeated_burn_sample_history",
      severity: "warning",
      message: `Shared sample confounder: Both ${runA.original_run_id} and ${runB.original_run_id} burned the same physical sample (${runA.sample_id}, clear ${runA.rod_diameter_mm} mm rod). Repeated-burn sample history and thermal conditioning must be considered when interpreting airflow differences.`,
    });
  }

  if (
    runA.flow_protocol === "changing_during_test" ||
    runB.flow_protocol === "changing_during_test" ||
    runA.flow_protocol === "staged" ||
    runB.flow_protocol === "staged" ||
    compareScalarValues(runA.flow_protocol, runB.flow_protocol) === "different"
  ) {
    confounders.push({
      type: "flow_protocol",
      severity: "warning",
      message: `Flow protocol caveat: Airflow changed during ${runA.original_run_id} (${runA.flow_protocol}) and/or ${runB.original_run_id} (${runB.flow_protocol}); distinguish raw fan displays from calibrated velocities.`,
    });
  }

  if (
    compareScalarValues(
      runA.initial_oxygen_pct,
      runB.initial_oxygen_pct,
      0.1
    ) === "different"
  ) {
    confounders.push({
      type: "oxygen",
      severity: "warning",
      message: `Oxygen confounder: Initial O2 differs between ${runA.original_run_id} (${runA.initial_oxygen_pct}%) and ${runB.original_run_id} (${runB.initial_oxygen_pct}%).`,
    });
  }

  if (
    compareScalarValues(runA.material_variant, runB.material_variant) ===
    "different"
  ) {
    confounders.push({
      type: "material_variant",
      severity: "warning",
      message: `Material variant confounder: ${runA.material_variant} vs ${runB.material_variant}.`,
    });
  }

  if (
    compareScalarValues(runA.rod_radius_mm, runB.rod_radius_mm, 1e-3) ===
    "different"
  ) {
    confounders.push({
      type: "rod_size",
      severity: "warning",
      message: `Geometry/size confounder: Rod radius differs (${runA.rod_radius_mm ?? "unreported"} mm vs ${runB.rod_radius_mm ?? "unreported"} mm).`,
    });
  }

  if (
    compareScalarValues(runA.flow_direction, runB.flow_direction) ===
    "different"
  ) {
    confounders.push({
      type: "orientation_or_flow_direction",
      severity: "warning",
      message: `Flow direction confounder: ${runA.flow_direction} vs ${runB.flow_direction}.`,
    });
  }

  if (
    compareScalarValues(runA.ignition_method, runB.ignition_method) ===
    "different"
  ) {
    confounders.push({
      type: "ignition_protocol",
      severity: "warning",
      message: `Ignition protocol confounder: ${runA.ignition_method} vs ${runB.ignition_method}.`,
    });
  }

  const allRows = [
    ...sampleAndApparatus,
    ...experimentalConditions,
    ...measuredQuantities,
    ...outcomes,
  ];
  const summaryDifferences = allRows
    .filter((r) => r.status === "different")
    .map((r) => `${r.label}: ${r.display_a} vs ${r.display_b}`);

  const unknownFields = allRows
    .filter((r) => r.status === "unknown")
    .map(
      (r) =>
        `${r.label} is unreported in one or both runs (unknown values never match).`
    );

  return {
    status: "compared",
    run_a_id: runA.run_id,
    run_b_id: runB.run_id,
    summary_differences: [...summaryDifferences, ...unknownFields],
    confounders,
    sections: {
      sample_and_apparatus: sampleAndApparatus,
      experimental_conditions: experimentalConditions,
      measured_quantities: measuredQuantities,
      outcomes,
    },
  };
}

export function checkScenarioApplicability(
  resolvedScenario: ResolvedScenario,
  catalog: Catalog
): ScenarioApplicabilityResult {
  const bassII = catalog.investigations.find((i) => i.id === "BASS-II");
  const rows: ApplicabilityRow[] = [];

  // 1. Gravity comparison
  if (resolvedScenario.gravity_regime) {
    rows.push({
      parameter: "gravity",
      target_display:
        resolvedScenario.gravity_regime === "lunar_1_6g"
          ? "Lunar gravity (~1/6 Earth g)"
          : resolvedScenario.gravity_regime === "microgravity"
          ? "ISS Microgravity (~0 g)"
          : "Earth gravity (1 g)",
      measurement_basis: "assumed",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display:
            "ISS microgravity (~0 g) and separate short Drop Tower tests",
          status:
            resolvedScenario.gravity_regime === "microgravity"
              ? "same_regime"
              : "outside_reported_range",
          reason:
            resolvedScenario.gravity_regime === "microgravity"
              ? "BASS-II was conducted in ISS microgravity aboard the Microgravity Science Glovebox."
              : "BASS-II did not test at 1/6 g lunar partial gravity.",
        },
        {
          investigation_id: "LUCI",
          study_value_display:
            "Lunar gravity (~1/6 g) simulated aboard a rotating New Shepard sounding rocket",
          status:
            resolvedScenario.gravity_regime === "lunar_1_6g"
              ? "same_regime"
              : "outside_reported_range",
          reason:
            resolvedScenario.gravity_regime === "lunar_1_6g"
              ? "LUCI simulated ~1/6 g lunar gravity aboard a rotating Blue Origin New Shepard sounding rocket (NTRS 20250010653)."
              : "LUCI focused on simulated partial gravity rather than orbital microgravity.",
        },
      ],
    });
  }

  // 2. Oxygen comparison
  if (
    resolvedScenario.oxygen_pct !== null &&
    resolvedScenario.oxygen_pct !== undefined
  ) {
    const bassO2 = bassII?.conditions_coverage.oxygen_range_pct ?? [13.6, 21.0];
    const bassStatus =
      resolvedScenario.oxygen_pct >= bassO2[0] &&
      resolvedScenario.oxygen_pct <= bassO2[1]
        ? "within_reported_range"
        : "outside_reported_range";

    rows.push({
      parameter: "oxygen_pct",
      target_display: `${resolvedScenario.oxygen_pct}% O2 (volume percent)`,
      measurement_basis:
        resolvedScenario.gravity_regime === "lunar_1_6g" ? "assumed" : "initial",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display: `${bassO2[0]}% – ${bassO2[1]}% O2 (initial/final reported range)`,
          status: bassStatus,
          reason:
            bassStatus === "within_reported_range"
              ? `Target ${resolvedScenario.oxygen_pct}% O2 falls within BASS-II tested range (${bassO2[0]}–${bassO2[1]}% O2).`
              : `Target ${resolvedScenario.oxygen_pct}% O2 exceeds BASS-II maximum tested oxygen (${bassO2[1]}% O2).`,
        },
        {
          investigation_id: "LUCI",
          study_value_display:
            "21.0% O2 (normal-pressure air in shared sounding-rocket chamber)",
          status:
            Math.abs(resolvedScenario.oxygen_pct - 21.0) <= 0.5
              ? "within_reported_range"
              : "outside_reported_range",
          reason:
            Math.abs(resolvedScenario.oxygen_pct - 21.0) <= 0.5
              ? "Matches LUCI normal-air oxygen concentration (21% O2 at shared-chamber level)."
              : `Target ${resolvedScenario.oxygen_pct}% O2 is outside LUCI normal-air atmosphere (21.0% O2).`,
        },
      ],
    });
  }

  // 3. Absolute Pressure comparison
  if (
    resolvedScenario.pressure_kpa !== null &&
    resolvedScenario.pressure_kpa !== undefined
  ) {
    const psiaEquivalent =
      resolvedScenario.pressure_psia ??
      Math.round((resolvedScenario.pressure_kpa / PSIA_TO_KPA) * 100) / 100;

    rows.push({
      parameter: "pressure_kpa",
      target_display: `${resolvedScenario.pressure_kpa} kPa (${psiaEquivalent} psia)`,
      measurement_basis:
        resolvedScenario.gravity_regime === "lunar_1_6g" ? "assumed" : "nominal",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display:
            "Unreported in Table A.5 run matrix (nominal ISS cabin ~101.3 kPa labeled separately)",
          status: "unreported",
          reason:
            "Run-level pressure is unreported in BASS-II Table A.5; nominal ISS MSG pressure (~101.3 kPa) cannot substitute for measured run-level pressure.",
        },
        {
          investigation_id: "LUCI",
          study_value_display:
            "101.3 kPa (14.7 psia normal-pressure air in shared sounding-rocket chamber)",
          status:
            Math.abs(resolvedScenario.pressure_kpa - 101.3) <= 2.0
              ? "within_reported_range"
              : "outside_reported_range",
          reason:
            Math.abs(resolvedScenario.pressure_kpa - 101.3) <= 2.0
              ? "Matches LUCI normal-pressure chamber air (~101.3 kPa)."
              : `Target ${resolvedScenario.pressure_kpa} kPa (${psiaEquivalent} psia) is outside LUCI normal-pressure chamber air (101.3 kPa).`,
        },
      ],
    });
  } else {
    rows.push({
      parameter: "pressure_kpa",
      target_display: "unreported / unset",
      measurement_basis: "unreported",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display: "unreported at run level in Table A.5",
          status: "unreported",
          reason:
            "Run pressure is unreported in BASS-II Table A.5. Any nominal ISS chamber environment (~101.3 kPa) is labeled separately.",
        },
      ],
    });
  }

  // 4. Airflow comparison
  if (
    resolvedScenario.airflow_cm_s !== null &&
    resolvedScenario.airflow_cm_s !== undefined
  ) {
    const bassFlow = bassII?.conditions_coverage.airflow_range_cm_s ?? [
      0.5, 45.0,
    ];
    const flowInRange =
      resolvedScenario.airflow_cm_s >= bassFlow[0] &&
      resolvedScenario.airflow_cm_s <= bassFlow[1];
    rows.push({
      parameter: "airflow_cm_s",
      target_display: `${resolvedScenario.airflow_cm_s} cm/s`,
      measurement_basis: "measured",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display: `${bassFlow[0]} – ${bassFlow[1]} cm/s forced duct flow`,
          status: flowInRange
            ? "within_reported_range"
            : "outside_reported_range",
          reason: flowInRange
            ? `Requested ${resolvedScenario.airflow_cm_s} cm/s is within BASS-II forced concurrent flow range.`
            : `Requested ${resolvedScenario.airflow_cm_s} cm/s is outside BASS-II range (${bassFlow[0]}–${bassFlow[1]} cm/s).`,
        },
        {
          investigation_id: "LUCI",
          study_value_display:
            "Unreported duct velocity (rotating sounding-rocket chamber with shared 4 mm acrylic rod + fabric)",
          status: "different_configuration",
          reason:
            "LUCI rotated the New Shepard sounding-rocket payload to simulate lunar gravity and burned a 4 mm acrylic rod alongside cotton-fiberglass fabric in the same chamber.",
        },
      ],
    });
  }

  // 5. Material & Apparatus Configuration row
  if (resolvedScenario.material) {
    rows.push({
      parameter: "material_and_configuration",
      target_display: `${resolvedScenario.material} (${resolvedScenario.geometry_shape ?? "any shape"})`,
      measurement_basis: "nominal",
      study_comparisons: [
        {
          investigation_id: "BASS-II",
          study_value_display:
            "Clear 9.525 mm diameter PMMA rod (sample 218m) in 7.6 cm x 7.6 cm MSG flow duct",
          status:
            resolvedScenario.material.toUpperCase() === "PMMA"
              ? "within_reported_range"
              : "different_configuration",
          reason:
            "BASS-II burned isolated PMMA rods in a dedicated microgravity flow duct.",
        },
        {
          investigation_id: "LUCI",
          study_value_display:
            "4 mm diameter PMMA rod and cotton-fiberglass fabric burned simultaneously in shared sounding-rocket chamber",
          status: "different_configuration",
          reason:
            "LUCI burned a 4 mm acrylic rod and cotton-fiberglass fabric at the same time inside a rotating New Shepard payload chamber; oxygen readings apply at shared-chamber level.",
        },
      ],
    });
  }

  // 6. Strict Joint Combination Check across single reviewed runs
  // Reported study ranges, nominal chamber values, and matches across different tests CANNOT establish a joint match.
  // A single verified run must satisfy ALL entered criteria, including requested_outcome.
  const hasEnteredCriteria =
    resolvedScenario.scenario_state === "evaluated" &&
    Boolean(
      resolvedScenario.material ||
        resolvedScenario.geometry_shape ||
        resolvedScenario.requested_outcome ||
        resolvedScenario.gravity_regime ||
        (resolvedScenario.oxygen_pct !== null &&
          resolvedScenario.oxygen_pct !== undefined) ||
        (resolvedScenario.pressure_kpa !== null &&
          resolvedScenario.pressure_kpa !== undefined) ||
        (resolvedScenario.airflow_cm_s !== null &&
          resolvedScenario.airflow_cm_s !== undefined)
    );

  const exactMatchRunIds: string[] = [];
  const approxMatchRunIds: string[] = [];

  if (hasEnteredCriteria) {
    for (const run of catalog.runs) {
      if (run.review_status !== "verified") continue;

      if (
        resolvedScenario.material &&
        !run.material_variant
          .toLowerCase()
          .includes(resolvedScenario.material.toLowerCase())
      ) {
        continue;
      }
      if (
        resolvedScenario.geometry_shape &&
        run.geometry_shape.toLowerCase() !==
          resolvedScenario.geometry_shape.toLowerCase()
      ) {
        continue;
      }
      if (
        resolvedScenario.gravity_regime &&
        run.gravity_regime !== resolvedScenario.gravity_regime
      ) {
        continue;
      }

      // Check requested_outcome against run's observed_outcome or measured_quantities_reported
      if (resolvedScenario.requested_outcome) {
        const reqOut = resolvedScenario.requested_outcome.toLowerCase();
        const matchesObserved = run.observed_outcome.toLowerCase() === reqOut;
        const matchesReportedQty = run.measured_quantities_reported.some(
          (q) => q.toLowerCase() === reqOut
        );
        if (!matchesObserved && !matchesReportedQty) {
          continue;
        }
      }

      // Check pressure (nominal chamber values or null cannot satisfy a joint match!)
      if (
        resolvedScenario.pressure_kpa !== null &&
        resolvedScenario.pressure_kpa !== undefined
      ) {
        if (
          run.pressure_kpa === null ||
          run.pressure_basis === "nominal_chamber" ||
          run.pressure_basis === "unreported"
        ) {
          continue;
        }
      }

      let isExact = true;
      let isApprox = true;

      if (
        resolvedScenario.oxygen_pct !== null &&
        resolvedScenario.oxygen_pct !== undefined
      ) {
        if (run.initial_oxygen_pct === null) {
          isExact = false;
          isApprox = false;
        } else {
          const diffO2 = Math.abs(
            run.initial_oxygen_pct - resolvedScenario.oxygen_pct
          );
          if (diffO2 > 0.1) isExact = false;
          if (diffO2 > 1.0) isApprox = false;
        }
      }

      if (
        resolvedScenario.pressure_kpa !== null &&
        resolvedScenario.pressure_kpa !== undefined &&
        run.pressure_kpa !== null
      ) {
        const diffP = Math.abs(
          run.pressure_kpa - resolvedScenario.pressure_kpa
        );
        if (diffP > 0.5) isExact = false;
        if (diffP > 3.0) isApprox = false;
      }

      if (
        resolvedScenario.airflow_cm_s !== null &&
        resolvedScenario.airflow_cm_s !== undefined
      ) {
        if (run.airflow_cm_s === null) {
          isExact = false;
          isApprox = false;
        } else {
          const diffFlow = Math.abs(
            run.airflow_cm_s - resolvedScenario.airflow_cm_s
          );
          if (diffFlow > 0.2) isExact = false;
          if (diffFlow > 1.0) isApprox = false;
        }
      }

      if (isExact) {
        exactMatchRunIds.push(run.run_id);
      } else if (isApprox) {
        approxMatchRunIds.push(run.run_id);
      }
    }
  }

  const combinationTested = exactMatchRunIds.length > 0;
  const combinationMessage = combinationTested
    ? `${exactMatchRunIds.length} verified test(s) in this collection satisfy all entered criteria (${exactMatchRunIds.join(", ")}).`
    : approxMatchRunIds.length > 0
    ? `No verified test in this collection matches this exact combination (approximate near-matches within broader tolerance: ${approxMatchRunIds.join(", ")}).`
    : "No verified test in this collection matches this combination.";

  return {
    preset_used: resolvedScenario.preset_applied,
    scenario_state: resolvedScenario.scenario_state,
    applied_scenario: resolvedScenario,
    unset_fields: resolvedScenario.unset_fields,
    combination_tested: combinationTested,
    matching_verified_run_ids: exactMatchRunIds,
    approximate_match_run_ids: approxMatchRunIds,
    combination_message: combinationMessage,
    rows,
    rover_panel_studies:
      resolvedScenario.gravity_regime === "lunar_1_6g"
        ? ["BASS-II", "LUCI"]
        : ["BASS-II"],
    evidence_gap_summary:
      "Within this curated collection, BASS-II provides PMMA concurrent-flow extinction evidence in ISS microgravity (13.6–21% O2, sample 218m and Figure 6.4), and LUCI provides a simulated lunar-gravity (~1/6 g) comparison aboard a rotating New Shepard sounding rocket in normal-pressure air (21% O2, 101.3 kPa, 4 mm PMMA rod + fabric in a shared chamber), but no verified test in this collection covers PMMA simultaneously at 1/6 g in the 34% O2, 8.2 psia (56.5 kPa) exploration atmosphere.",
    defer_predictive_interpolation_note:
      "Predictive interpolation is intentionally deferred: NASA partial-gravity fire safety research (SRC_PARTIAL_G_REVIEW) shows buoyant convection at ~1/6 g can replenish oxygen faster than microgravity diffusion while generating weaker blowoff shear than 1 g, so partial-gravity flammability can extend beyond both microgravity and Earth-gravity limits.",
  };
}
