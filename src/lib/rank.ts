// src/lib/rank.ts
import {
  Catalog,
  Investigation,
  RankedInvestigationResult,
  RankingCriterionBreakdown,
  ResolvedScenario,
  ScenarioInput,
} from "./schema";

export const RANKING_WEIGHTS = Object.freeze({
  research_objective: 35,
  material_and_geometry: 25,
  conditions_and_setup: 25,
  measured_outcome: 15,
} as const);

const EXTINCTION_FAMILY = new Set([
  "quenching",
  "blowoff",
  "sustained_burning",
  "failed_sustained_ignition",
  "extinction_limit",
  "flammability_limit",
]);

function scoreResearchObjective(
  inv: Investigation,
  scenario: ScenarioInput
): { score: 0 | 0.5 | 1; reason: string; status: "matched" | "partial" | "mismatched" } {
  if (!scenario.task) {
    // If no task chip is explicitly set, infer relevance from material/outcome if present
    if (
      scenario.requested_outcome === "smoke_particle_size" &&
      inv.task_tags.includes("smoke_detection")
    ) {
      return {
        score: 1,
        reason: `Direct objective match for smoke particle sizing (${inv.objective_tags.join(", ")}).`,
        status: "matched",
      };
    }
    if (
      scenario.requested_outcome === "droplet_extinction" &&
      inv.task_tags.includes("suppression")
    ) {
      return {
        score: 1,
        reason: `Direct objective match for droplet suppression (${inv.objective_tags.join(", ")}).`,
        status: "matched",
      };
    }
    return {
      score: 1,
      reason: "Browse mode (no specific task filter restricted).",
      status: "matched",
    };
  }

  if (scenario.task === "larger_fire_spread") {
    if (
      inv.task_tags.includes("larger_fire_spread") &&
      inv.scale_class === "meter_scale_enclosure"
    ) {
      return {
        score: 1,
        reason: `Direct match for large-scale enclosure fire growth (${inv.sample_dimensions_summary}).`,
        status: "matched",
      };
    }
    if (inv.fuel_class === "solid" || inv.fuel_class === "mixed_chamber") {
      return {
        score: 0.5,
        reason: `Related solid-fuel flame spread study, but conducted at small sample/chamber scale (${inv.scale_class}) rather than meter-scale enclosure growth.`,
        status: "partial",
      };
    }
    return {
      score: 0,
      reason: `Study objective (${inv.task_tags.join(", ")}) does not target large-scale solid fire spread.`,
      status: "mismatched",
    };
  }

  if (inv.task_tags.includes(scenario.task)) {
    return {
      score: 1,
      reason: `Direct match for task '${scenario.task}' (${inv.objective_tags.join(", ")}).`,
      status: "matched",
    };
  }

  const solidCombustionTasks = new Set([
    "materials_and_ventilation",
    "larger_fire_spread",
  ]);
  if (
    solidCombustionTasks.has(scenario.task) &&
    inv.task_tags.some((t) => solidCombustionTasks.has(t))
  ) {
    return {
      score: 0.5,
      reason: `Related solid-fuel combustion objective (${inv.task_tags.join(", ")}).`,
      status: "partial",
    };
  }

  return {
    score: 0,
    reason: `Study objective (${inv.task_tags.join(", ")}) does not target '${scenario.task}'.`,
    status: "mismatched",
  };
}

function scoreMaterialAndGeometry(
  inv: Investigation,
  scenario: ScenarioInput
): {
  active: boolean;
  score: 0 | 0.5 | 1;
  reason: string;
  status: "matched" | "partial" | "mismatched" | "unknown" | "omitted";
  unknown: boolean;
} {
  const hasMaterial = Boolean(scenario.material);
  const hasGeometry = Boolean(scenario.geometry_shape);

  if (!hasMaterial && !hasGeometry) {
    return {
      active: false,
      score: 0,
      reason: "Material and geometry left unspecified by user; weight omitted.",
      status: "omitted",
      unknown: false,
    };
  }

  let matScore: 0 | 0.5 | 1 = 0;
  let geoScore: 0 | 0.5 | 1 = 0;
  const reasons: string[] = [];

  if (hasMaterial && scenario.material) {
    const reqMat = scenario.material.toLowerCase();
    const invMats = inv.material.map((m) => m.toLowerCase());
    if (invMats.includes(reqMat)) {
      if (inv.fuel_class === "mixed_chamber" && scenario.task === "larger_fire_spread") {
        matScore = 0.5;
        reasons.push(
          `Tested ${scenario.material} inside a small shared sounding-rocket chamber (${inv.sample_dimensions_summary}) rather than an isolated large-scale panel.`
        );
      } else {
        matScore = 1;
        reasons.push(`Exact material match (${scenario.material}).`);
      }
    } else if (inv.is_proxy_experiment) {
      matScore = 0;
      reasons.push(
        `Proxy experiment (${inv.fuel_class}); measurements cannot be pooled with ${scenario.material}.`
      );
    } else if (
      (reqMat === "pmma" || reqMat === "cotton_fiberglass") &&
      (inv.fuel_class === "solid" || inv.fuel_class === "mixed_chamber")
    ) {
      matScore = 0.5;
      reasons.push(
        `Related solid fuel class, but tested ${inv.material.join("/")} instead of ${scenario.material}.`
      );
    } else {
      matScore = 0;
      reasons.push(
        `Material mismatch: study uses ${inv.material.join("/")} (${inv.fuel_class}).`
      );
    }
  }

  if (hasGeometry && scenario.geometry_shape) {
    const reqGeo = scenario.geometry_shape.toLowerCase();
    const invGeos = inv.geometry_shape.map((g) => g.toLowerCase());
    if (invGeos.includes(reqGeo)) {
      geoScore = 1;
      reasons.push(`Exact geometry match (${scenario.geometry_shape}).`);
    } else if (
      (reqGeo === "rod" || reqGeo === "flat_sheet" || reqGeo === "cylinder") &&
      invGeos.some((g) => g === "rod" || g === "flat_sheet" || g === "cylinder")
    ) {
      geoScore = 0.5;
      reasons.push(`Related solid sample geometry (${inv.geometry_shape.join("/")}).`);
    } else {
      geoScore = 0;
      reasons.push(`Geometry mismatch: study uses ${inv.geometry_shape.join("/")}.`);
    }
  }

  let combined: 0 | 0.5 | 1 = 0;
  if (hasMaterial && hasGeometry) {
    const raw = 0.6 * matScore + 0.4 * geoScore;
    combined = raw >= 0.85 ? 1 : raw >= 0.3 ? 0.5 : 0;
  } else if (hasMaterial) {
    combined = matScore;
  } else {
    combined = geoScore;
  }

  const status =
    combined === 1 ? "matched" : combined === 0.5 ? "partial" : "mismatched";

  return {
    active: true,
    score: combined,
    reason: reasons.join(" "),
    status,
    unknown: false,
  };
}

interface ConditionSubScore {
  dimension: "gravity" | "oxygen" | "pressure" | "airflow";
  weight: number;
  score: 0 | 0.5 | 1;
  status: "matched" | "partial" | "mismatched" | "unknown";
  unknown: boolean;
  reason: string;
}

function evaluateConditions(
  inv: Investigation,
  scenario: ScenarioInput
): ConditionSubScore[] {
  const rawSubs: Array<Omit<ConditionSubScore, "weight">> = [];
  const cov = inv.conditions_coverage;

  if (scenario.gravity_regime !== null && scenario.gravity_regime !== undefined) {
    if (!cov.gravity_regimes || cov.gravity_regimes.length === 0) {
      rawSubs.push({
        dimension: "gravity",
        score: 0,
        status: "unknown",
        unknown: true,
        reason: "Gravity regime is unreported for this investigation.",
      });
    } else if (cov.gravity_regimes.includes(scenario.gravity_regime)) {
      rawSubs.push({
        dimension: "gravity",
        score: 1,
        status: "matched",
        unknown: false,
        reason: `Covers requested gravity regime (${scenario.gravity_regime}).`,
      });
    } else if (
      (scenario.gravity_regime === "lunar_1_6g" &&
        cov.gravity_regimes.includes("microgravity")) ||
      (scenario.gravity_regime === "microgravity" &&
        cov.gravity_regimes.includes("lunar_1_6g"))
    ) {
      rawSubs.push({
        dimension: "gravity",
        score: 0.5,
        status: "partial",
        unknown: false,
        reason: `Tested in ${cov.gravity_regimes.join(", ")} rather than ${scenario.gravity_regime}.`,
      });
    } else {
      rawSubs.push({
        dimension: "gravity",
        score: 0,
        status: "mismatched",
        unknown: false,
        reason: `Gravity mismatch: study covers ${cov.gravity_regimes.join(", ")}.`,
      });
    }
  }

  if (scenario.oxygen_pct !== null && scenario.oxygen_pct !== undefined) {
    const range = cov.oxygen_range_pct;
    if (!range) {
      rawSubs.push({
        dimension: "oxygen",
        score: 0,
        status: "unknown",
        unknown: true,
        reason: `Requested ${scenario.oxygen_pct}% O2, but study oxygen range is unreported.`,
      });
    } else if (
      scenario.oxygen_pct >= range[0] &&
      scenario.oxygen_pct <= range[1]
    ) {
      rawSubs.push({
        dimension: "oxygen",
        score: 1,
        status: "matched",
        unknown: false,
        reason: `Requested ${scenario.oxygen_pct}% O2 is within reported range (${range[0]}–${range[1]}% O2).`,
      });
    } else if (
      scenario.oxygen_pct >= range[0] - 5.0 &&
      scenario.oxygen_pct <= range[1] + 5.0
    ) {
      rawSubs.push({
        dimension: "oxygen",
        score: 0.5,
        status: "partial",
        unknown: false,
        reason: `Requested ${scenario.oxygen_pct}% O2 is near reported range (${range[0]}–${range[1]}% O2).`,
      });
    } else {
      rawSubs.push({
        dimension: "oxygen",
        score: 0,
        status: "mismatched",
        unknown: false,
        reason: `Requested ${scenario.oxygen_pct}% O2 is outside reported range (${range[0]}–${range[1]}% O2).`,
      });
    }
  }

  if (scenario.pressure_kpa !== null && scenario.pressure_kpa !== undefined) {
    const range = cov.pressure_range_kpa;
    if (!range) {
      rawSubs.push({
        dimension: "pressure",
        score: 0,
        status: "unknown",
        unknown: true,
        reason: `Requested ${scenario.pressure_kpa} kPa, but study run-level pressure is unreported.`,
      });
    } else if (
      scenario.pressure_kpa >= range[0] &&
      scenario.pressure_kpa <= range[1]
    ) {
      rawSubs.push({
        dimension: "pressure",
        score: 1,
        status: "matched",
        unknown: false,
        reason: `Requested ${scenario.pressure_kpa} kPa is within reported range (${range[0]}–${range[1]} kPa).`,
      });
    } else if (
      scenario.pressure_kpa >= range[0] - 15.0 &&
      scenario.pressure_kpa <= range[1] + 15.0
    ) {
      rawSubs.push({
        dimension: "pressure",
        score: 0.5,
        status: "partial",
        unknown: false,
        reason: `Requested ${scenario.pressure_kpa} kPa is near reported range (${range[0]}–${range[1]} kPa).`,
      });
    } else {
      rawSubs.push({
        dimension: "pressure",
        score: 0,
        status: "mismatched",
        unknown: false,
        reason: `Requested ${scenario.pressure_kpa} kPa is outside reported range (${range[0]}–${range[1]} kPa).`,
      });
    }
  }

  if (scenario.airflow_cm_s !== null && scenario.airflow_cm_s !== undefined) {
    const range = cov.airflow_range_cm_s;
    if (!range) {
      rawSubs.push({
        dimension: "airflow",
        score: 0,
        status: "unknown",
        unknown: true,
        reason: `Requested ${scenario.airflow_cm_s} cm/s airflow, but study duct airflow is unreported.`,
      });
    } else if (
      scenario.airflow_cm_s >= range[0] &&
      scenario.airflow_cm_s <= range[1]
    ) {
      rawSubs.push({
        dimension: "airflow",
        score: 1,
        status: "matched",
        unknown: false,
        reason: `Requested ${scenario.airflow_cm_s} cm/s is within reported range (${range[0]}–${range[1]} cm/s).`,
      });
    } else if (
      scenario.airflow_cm_s >= range[0] - 5.0 &&
      scenario.airflow_cm_s <= range[1] + 5.0
    ) {
      rawSubs.push({
        dimension: "airflow",
        score: 0.5,
        status: "partial",
        unknown: false,
        reason: `Requested ${scenario.airflow_cm_s} cm/s is near reported range (${range[0]}–${range[1]} cm/s).`,
      });
    } else {
      rawSubs.push({
        dimension: "airflow",
        score: 0,
        status: "mismatched",
        unknown: false,
        reason: `Requested ${scenario.airflow_cm_s} cm/s is outside reported range (${range[0]}–${range[1]} cm/s).`,
      });
    }
  }

  if (rawSubs.length === 0) return [];
  const perSubWeight =
    Math.round((RANKING_WEIGHTS.conditions_and_setup / rawSubs.length) * 100) /
    100;
  return rawSubs.map((s) => ({ ...s, weight: perSubWeight }));
}

function scoreMeasuredOutcome(
  inv: Investigation,
  scenario: ScenarioInput
): {
  active: boolean;
  score: 0 | 0.5 | 1;
  reason: string;
  status: "matched" | "partial" | "mismatched" | "omitted";
} {
  if (!scenario.requested_outcome) {
    if (!scenario.task) {
      return {
        active: false,
        score: 0,
        reason: "Measured outcome left unspecified; weight omitted.",
        status: "omitted",
      };
    }
    const taskOutcomeMap: Record<string, string[]> = {
      materials_and_ventilation: [
        "quenching",
        "blowoff",
        "extinction_limit",
        "flammability_limit",
      ],
      larger_fire_spread: [
        "large_scale_flame_spread",
        "enclosure_pressure_rise",
      ],
      smoke_detection: [
        "smoke_particle_size",
        "moment_average_diameter",
        "detector_response",
      ],
      suppression: [
        "suppressant_concentration",
        "droplet_extinction",
        "cool_flame",
      ],
    };
    const expected = taskOutcomeMap[scenario.task] ?? [];
    const hasDirect = inv.measured_outcomes.some((o) => expected.includes(o));
    if (hasDirect) {
      return {
        active: true,
        score: 1,
        reason: `Directly measures ${inv.measured_outcomes.join(", ")} for ${scenario.task}.`,
        status: "matched",
      };
    }
    if (
      scenario.task === "larger_fire_spread" &&
      inv.measured_outcomes.includes("flame_spread_rate")
    ) {
      return {
        score: 0.5,
        active: true,
        reason: `Measures small-sample flame spread (${inv.measured_outcomes.join(", ")}), not meter-scale enclosure fire growth.`,
        status: "partial",
      };
    }
    return {
      active: true,
      score: 0,
      reason: `Measured outcomes (${inv.measured_outcomes.join(", ")}) do not directly measure ${scenario.task} targets.`,
      status: "mismatched",
    };
  }

  const req = scenario.requested_outcome.toLowerCase();
  const invOutcomes = inv.measured_outcomes.map((o) => o.toLowerCase());

  if (invOutcomes.includes(req)) {
    return {
      active: true,
      score: 1,
      reason: `Direct measurement of '${scenario.requested_outcome}'.`,
      status: "matched",
    };
  }

  if (
    EXTINCTION_FAMILY.has(req) &&
    invOutcomes.some((o) => EXTINCTION_FAMILY.has(o))
  ) {
    return {
      active: true,
      score: 0.5,
      reason: `Measures related extinction/flammability outcome (${inv.measured_outcomes.join(", ")}).`,
      status: "partial",
    };
  }

  return {
    active: true,
    score: 0,
    reason: `Does not report outcome '${scenario.requested_outcome}'.`,
    status: "mismatched",
  };
}

export function rankInvestigations(
  scenario: ScenarioInput | ResolvedScenario,
  catalog: Catalog
): RankedInvestigationResult[] {
  const isLunarContext = scenario.gravity_regime === "lunar_1_6g";

  const results: RankedInvestigationResult[] = catalog.investigations.map((inv) => {
    const breakdown: RankingCriterionBreakdown[] = [];
    let weightedSum = 0;
    let activeWeightDenominator = 0;

    // 1. Research Objective (Weight: 35)
    const objRes = scoreResearchObjective(inv, scenario);
    weightedSum += RANKING_WEIGHTS.research_objective * objRes.score;
    activeWeightDenominator += RANKING_WEIGHTS.research_objective;
    breakdown.push({
      criterion: "research_objective",
      weight: RANKING_WEIGHTS.research_objective,
      active: true,
      score: objRes.score,
      status: objRes.status,
      unknown: false,
      reason: objRes.reason,
    });

    // 2. Material & Geometry (Weight: 25)
    const matRes = scoreMaterialAndGeometry(inv, scenario);
    if (matRes.active) {
      weightedSum += RANKING_WEIGHTS.material_and_geometry * matRes.score;
      activeWeightDenominator += RANKING_WEIGHTS.material_and_geometry;
    }
    breakdown.push({
      criterion: "material_and_geometry",
      weight: matRes.active ? RANKING_WEIGHTS.material_and_geometry : 0,
      active: matRes.active,
      score: matRes.score,
      status: matRes.status,
      unknown: matRes.unknown,
      reason: matRes.reason,
    });

    // 3. Conditions & Setup (Weight: 25 split evenly across active condition dimensions)
    const condSubs = evaluateConditions(inv, scenario);
    if (condSubs.length > 0) {
      const subWeight = RANKING_WEIGHTS.conditions_and_setup / condSubs.length;
      let condWeighted = 0;
      for (const sub of condSubs) {
        condWeighted += subWeight * sub.score;
      }
      weightedSum += condWeighted;
      activeWeightDenominator += RANKING_WEIGHTS.conditions_and_setup;

      const anyUnknown = condSubs.some((s) => s.unknown);
      const avgScore = condWeighted / RANKING_WEIGHTS.conditions_and_setup;
      const discreteScore: 0 | 0.5 | 1 =
        avgScore >= 0.85 ? 1 : avgScore >= 0.25 ? 0.5 : 0;

      breakdown.push({
        criterion: "conditions_and_setup",
        weight: RANKING_WEIGHTS.conditions_and_setup,
        active: true,
        score: discreteScore,
        status: anyUnknown
          ? "unknown"
          : discreteScore === 1
          ? "matched"
          : discreteScore === 0.5
          ? "partial"
          : "mismatched",
        unknown: anyUnknown,
        reason: condSubs.map((s) => `[${s.dimension}] ${s.reason}`).join(" "),
        sub_criteria: condSubs,
      });
    } else {
      breakdown.push({
        criterion: "conditions_and_setup",
        weight: 0,
        active: false,
        score: 0,
        status: "omitted",
        unknown: false,
        reason: "No atmospheric or gravity conditions specified; weight omitted.",
      });
    }

    // 4. Measured Outcome (Weight: 15)
    const outRes = scoreMeasuredOutcome(inv, scenario);
    if (outRes.active) {
      weightedSum += RANKING_WEIGHTS.measured_outcome * outRes.score;
      activeWeightDenominator += RANKING_WEIGHTS.measured_outcome;
    }
    breakdown.push({
      criterion: "measured_outcome",
      weight: outRes.active ? RANKING_WEIGHTS.measured_outcome : 0,
      active: outRes.active,
      score: outRes.score,
      status: outRes.status,
      unknown: false,
      reason: outRes.reason,
    });

    const relevanceScore =
      activeWeightDenominator > 0
        ? Math.round((weightedSum / activeWeightDenominator) * 10000) / 100
        : 0;

    const matchingConditions = condSubs
      .filter((s) => s.status === "matched")
      .map((s) => s.reason);
    const missingOrMismatchedConditions = condSubs
      .filter((s) => s.status !== "matched")
      .map((s) => s.reason);

    return {
      investigation_id: inv.id,
      title: inv.title,
      study_relevance_score: relevanceScore,
      relevance_label: "study relevance (does not measure operational fire safety)",
      data_depth: inv.data_depth,
      published_run_count: inv.published_run_count,
      reviewed_run_count: inv.reviewed_run_count,
      is_proxy_experiment: inv.is_proxy_experiment,
      pinned_for_rover_panel: isLunarContext && inv.id === "LUCI",
      direct_outcome_score: outRes.active ? outRes.score : 0,
      breakdown,
      matching_conditions: matchingConditions,
      missing_or_mismatched_conditions: missingOrMismatchedConditions,
      research_lead: inv.research_lead,
      source_ids: inv.source_ids,
    };
  });

  // Deterministic Sort:
  // 1. Higher study_relevance_score
  // 2. Higher direct_outcome_score (1 > 0.5 > 0)
  // 3. Alphabetical by stable investigation_id
  results.sort((a, b) => {
    if (b.study_relevance_score !== a.study_relevance_score) {
      return b.study_relevance_score - a.study_relevance_score;
    }
    if (b.direct_outcome_score !== a.direct_outcome_score) {
      return b.direct_outcome_score - a.direct_outcome_score;
    }
    return a.investigation_id.localeCompare(b.investigation_id);
  });

  return results;
}
