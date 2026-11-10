// src/lib/schema.ts
import { z } from "zod";

// ============================================================================
// 1. Enums & Literal Unions
// ============================================================================

export const TaskTagSchema = z.enum([
  "materials_and_ventilation",
  "larger_fire_spread",
  "smoke_detection",
  "suppression",
]);
export type TaskTag = z.infer<typeof TaskTagSchema>;

export const FuelClassSchema = z.enum([
  "solid",
  "liquid_droplet",
  "gas_proxy",
  "mixed_chamber",
]);
export type FuelClass = z.infer<typeof FuelClassSchema>;

export const ScaleClassSchema = z.enum([
  "small_duct_sample",
  "meter_scale_enclosure",
  "shared_chamber_rocket",
  "droplet_apparatus",
]);
export type ScaleClass = z.infer<typeof ScaleClassSchema>;

export const DataDepthSchema = z.enum([
  "verified_runs",
  "published_reference",
  "study_summary",
]);
export type DataDepth = z.infer<typeof DataDepthSchema>;

export const GravityRegimeSchema = z.enum([
  "microgravity",
  "lunar_1_6g",
  "martian_0_38g",
  "earth_1g",
  "partial_g_other",
]);
export type GravityRegime = z.infer<typeof GravityRegimeSchema>;

export const FacilityPlatformSchema = z.enum([
  "ISS_MGBX",
  "Drop_Tower",
  "Sounding_Rocket_New_Shepard",
  "Cygnus_Spacecraft",
  "ISS_CIR",
]);
export type FacilityPlatform = z.infer<typeof FacilityPlatformSchema>;

export const FlowDirectionSchema = z.enum([
  "concurrent",
  "opposed",
  "none",
  "unknown",
]);
export type FlowDirection = z.infer<typeof FlowDirectionSchema>;

export const FlowProtocolSchema = z.enum([
  "fixed",
  "staged",
  "changing_during_test",
  "unknown",
]);
export type FlowProtocol = z.infer<typeof FlowProtocolSchema>;

export const PressureBasisSchema = z.enum([
  "absolute",
  "gauge",
  "nominal_chamber",
  "unreported",
]);
export type PressureBasis = z.infer<typeof PressureBasisSchema>;

export const ObservedOutcomeSchema = z.enum([
  "quenching",
  "blowoff",
  "sustained_burning",
  "failed_sustained_ignition",
  "unclassified_test_end",
  "unknown",
]);
export type ObservedOutcome = z.infer<typeof ObservedOutcomeSchema>;

export const ReviewStatusSchema = z.enum(["verified", "provisional"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const HumanSignoffStatusSchema = z.enum([
  "two_reviewer_verified",
  "demo_reviewed_pending_day14_final_signoff",
  "provisional_unreviewed",
]);
export type HumanSignoffStatus = z.infer<typeof HumanSignoffStatusSchema>;

export const OxygenBasisSchema = z.enum([
  "initial",
  "staged",
  "endpoint",
  "final",
  "unreported",
]);
export type OxygenBasis = z.infer<typeof OxygenBasisSchema>;

export const MeasurementBasisSchema = z.enum([
  "initial",
  "final",
  "endpoint",
  "modeled",
  "assumed",
  "nominal",
  "measured",
  "unreported",
]);
export type MeasurementBasis = z.infer<typeof MeasurementBasisSchema>;

export const EvidenceScopeSchema = z.enum([
  "study",
  "run",
  "phase",
  "shared_chamber",
]);
export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;

export const QualityFlagSchema = z.enum([
  "author_reported",
  "digitized_approximate",
  "provisional_figure",
]);
export type QualityFlag = z.infer<typeof QualityFlagSchema>;

export const ScenarioPresetIdSchema = z.enum([
  "iss_acrylic_experiment",
  "iss_acrylic",
  "iss_acrylic_benchmark",
  "illustrative_lunar_rover",
  "lunar_rover",
  "custom_scenario",
  "custom",
]);
export type ScenarioPresetId = z.infer<typeof ScenarioPresetIdSchema>;

export const ApplicabilityStatusSchema = z.enum([
  "same_regime",
  "within_reported_range",
  "outside_reported_range",
  "different_configuration",
  "unreported",
]);
export type ApplicabilityStatus = z.infer<typeof ApplicabilityStatusSchema>;

export const ComparisonStatusSchema = z.enum(["same", "different", "unknown"]);
export type ComparisonStatus = z.infer<typeof ComparisonStatusSchema>;

// ============================================================================
// 2. Core Catalog Entity Schemas
// ============================================================================

export const SourceSchema = z
  .object({
    id: z.string().min(1).max(64),
    publisher: z.string().min(1).max(200),
    title: z.string().min(1).max(400),
    url: z.string().url().max(500),
    doi_or_ntrs_id: z.string().min(1).max(120),
    version: z.string().min(1).max(64),
    accessed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reuse_terms: z.string().min(1).max(300),
    original_filenames: z.array(z.string().min(1).max(200)),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const ResearchLeadSchema = z
  .object({
    question: z.string().min(1).max(400),
    finding: z.string().min(1).max(600),
    conditions: z.string().min(1).max(400),
    limitation: z.string().min(1).max(400),
    evidence_ids: z.array(z.string().min(1).max(64)).min(1),
  })
  .strict();
export type ResearchLead = z.infer<typeof ResearchLeadSchema>;

export const InvestigationSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(300),
    objective_tags: z.array(z.string().min(1).max(80)).min(1),
    task_tags: z.array(TaskTagSchema).min(1),
    scale_class: ScaleClassSchema,
    fuel_class: FuelClassSchema,
    material: z.array(z.string().min(1).max(80)).min(1),
    geometry_shape: z.array(z.string().min(1).max(80)).min(1),
    sample_dimensions_summary: z.string().min(1).max(200),
    is_proxy_experiment: z.boolean(),
    published_run_count: z.number().int().nonnegative().nullable(),
    reviewed_run_count: z.number().int().nonnegative(),
    shared_hardware_context: z.string().max(400).nullable(),
    methods: z.string().min(1).max(600),
    measured_outcomes: z.array(z.string().min(1).max(80)).min(1),
    conditions_coverage: z
      .object({
        gravity_regimes: z.array(GravityRegimeSchema),
        oxygen_range_pct: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
        pressure_range_kpa: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
        airflow_range_cm_s: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
      })
      .strict(),
    limitations: z.string().min(1).max(600),
    data_depth: DataDepthSchema,
    research_lead: ResearchLeadSchema,
    source_ids: z.array(z.string().min(1).max(64)).min(1),
  })
  .strict();
export type Investigation = z.infer<typeof InvestigationSchema>;

export const RunSchema = z
  .object({
    run_id: z.string().min(1).max(64),
    original_run_id: z.string().min(1).max(64),
    investigation_id: z.string().min(1).max(64),
    sample_id: z.string().min(1).max(64),
    facility_platform: FacilityPlatformSchema,
    material_variant: z.string().min(1).max(120),
    geometry_shape: z.string().min(1).max(80),
    rod_radius_mm: z.number().finite().positive().nullable(),
    rod_diameter_mm: z.number().finite().positive().nullable(),
    length_mm: z.number().finite().positive().nullable(),
    gravity_regime: GravityRegimeSchema,
    gravity_method: z.string().min(1).max(200),
    flow_direction: FlowDirectionSchema,
    flow_protocol: FlowProtocolSchema,
    raw_flow_display: z.string().max(120).nullable(),
    fan_setting: z.string().max(120).nullable(),
    calibration_id: z.string().max(120).nullable(),
    airflow_cm_s: z.number().finite().nonnegative().nullable(),
    raw_oxygen_display: z.string().max(120).nullable(),
    initial_oxygen_pct: z.number().finite().min(0).max(100).nullable(),
    final_oxygen_pct: z.number().finite().min(0).max(100).nullable(),
    endpoint_oxygen_pct: z.number().finite().min(0).max(100).nullable(),
    pressure_kpa: z.number().finite().nonnegative().nullable(),
    pressure_psia: z.number().finite().nonnegative().nullable(),
    pressure_basis: PressureBasisSchema,
    ignition_method: z.string().max(200).nullable(),
    observed_outcome: ObservedOutcomeSchema,
    measured_quantities_reported: z.array(z.string().min(1).max(80)).min(1),
    anomalies: z.string().max(500).nullable(),
    evidence_ids: z.array(z.string().min(1).max(64)).min(1),
    review_status: ReviewStatusSchema,
    human_signoff_status: HumanSignoffStatusSchema,
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;

export const PhaseSchema = z
  .object({
    phase_id: z.string().min(1).max(64),
    run_id: z.string().min(1).max(64).nullable(),
    figure_id: z.string().min(1).max(64).nullable(),
    investigation_id: z.string().min(1).max(64),
    ordinal: z.number().int().positive(),
    elapsed_time_s: z.number().finite().nonnegative().nullable(),
    raw_flow_display: z.string().max(120).nullable(),
    airflow_cm_s: z.number().finite().nonnegative().nullable(),
    oxygen_pct: z.number().finite().min(0).max(100).nullable(),
    oxygen_basis: OxygenBasisSchema,
    observation: z.string().min(1).max(500),
    evidence_id: z.string().min(1).max(64),
    review_status: ReviewStatusSchema,
  })
  .strict();
export type Phase = z.infer<typeof PhaseSchema>;

export const EvidenceSchema = z
  .object({
    evidence_id: z.string().min(1).max(64),
    source_id: z.string().min(1).max(64),
    record_id: z.string().min(1).max(64),
    record_type: z.enum([
      "investigation",
      "run",
      "phase",
      "figure",
      "preset",
      "exclusion",
    ]),
    scope: EvidenceScopeSchema,
    field_name: z.string().min(1).max(80),
    printed_page: z.string().max(32).nullable(),
    pdf_page: z.string().max(32).nullable(),
    locator_detail: z.string().min(1).max(200),
    reviewed_fact: z.string().min(1).max(600),
    original_value: z.string().max(120).nullable(),
    original_unit: z.string().max(64).nullable(),
    normalized_value: z.number().finite().nullable(),
    normalized_unit: z.string().max(64).nullable(),
    measurement_basis: MeasurementBasisSchema,
    quality_flag: QualityFlagSchema,
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ExclusionRecordSchema = z
  .object({
    exclusion_id: z.string().min(1).max(64),
    source_id: z.string().min(1).max(64),
    candidate_row_ref: z.string().min(1).max(150),
    review_status: z.enum(["pending_human_review", "excluded"]),
    reason: z.string().min(1).max(500),
    resolution_rule: z.string().min(1).max(500),
  })
  .strict();
export type ExclusionRecord = z.infer<typeof ExclusionRecordSchema>;

export const CatalogSchema = z
  .object({
    catalog_version: z.string().min(1).max(64),
    sha256_hash: z.string().regex(/^[a-f0-9]{64}$/),
    generated_at: z.string().min(1).max(64),
    counts: z
      .object({
        sources: z.number().int().nonnegative(),
        investigations: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        verified_runs: z.number().int().nonnegative(),
        provisional_runs: z.number().int().nonnegative(),
        published_pmma_cohort_runs: z.number().int().nonnegative(),
        phases: z.number().int().nonnegative(),
        evidence: z.number().int().nonnegative(),
        exclusions: z.number().int().nonnegative(),
      })
      .strict(),
    sources: z.array(SourceSchema),
    investigations: z.array(InvestigationSchema),
    runs: z.array(RunSchema),
    phases: z.array(PhaseSchema),
    evidence: z.array(EvidenceSchema),
    exclusions: z.array(ExclusionRecordSchema),
  })
  .strict();
export type Catalog = z.infer<typeof CatalogSchema>;

// ============================================================================
// 3. Request & Response Contracts (API & Engines)
// ============================================================================

export const ScenarioInputSchema = z
  .object({
    preset: ScenarioPresetIdSchema.nullable().optional(),
    task: TaskTagSchema.nullable().optional(),
    question: z.string().max(500).nullable().optional(),
    material: z.string().max(80).nullable().optional(),
    geometry_shape: z.string().max(80).nullable().optional(),
    requested_outcome: z.string().max(80).nullable().optional(),
    gravity_regime: GravityRegimeSchema.nullable().optional(),
    oxygen_pct: z.number().finite().min(0).max(100).nullable().optional(),
    pressure_kpa: z.number().finite().min(0).max(500).nullable().optional(),
    pressure_psia: z.number().finite().min(0).max(75).nullable().optional(),
    airflow_cm_s: z.number().finite().min(0).max(500).nullable().optional(),
    selected_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
    compare_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
  })
  .strict();
export type ScenarioInput = z.infer<typeof ScenarioInputSchema>;

export const ResolvedScenarioSchema = ScenarioInputSchema.extend({
  scenario_state: z.enum(["evaluated", "browse_or_insufficient_input"]),
  preset_applied: ScenarioPresetIdSchema.nullable(),
  unset_fields: z.array(z.string()),
  explicit_overrides: z.array(z.string()),
});
export type ResolvedScenario = z.infer<typeof ResolvedScenarioSchema>;

export const RunExplorerFilterSchema = z
  .object({
    investigation_id: z.string().max(64).optional(),
    facility_platform: FacilityPlatformSchema.optional(),
    material_variant: z.string().max(120).optional(),
    geometry_shape: z.string().max(80).optional(),
    flow_direction: FlowDirectionSchema.optional(),
    flow_protocol: FlowProtocolSchema.optional(),
    observed_outcome: ObservedOutcomeSchema.optional(),
    min_oxygen_pct: z.number().finite().min(0).max(100).nullable().optional(),
    max_oxygen_pct: z.number().finite().min(0).max(100).nullable().optional(),
    include_provisional: z.boolean().optional(),
  })
  .strict();
export type RunExplorerFilter = z.infer<typeof RunExplorerFilterSchema>;

export const EvaluateRequestSchema = z
  .object({
    scenario: ScenarioInputSchema.optional(),
    question: z.string().max(500).nullable().optional(),
    run_filters: RunExplorerFilterSchema.optional(),
    selected_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
    compare_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
    data_version: z.string().max(64).optional(),
    catalog_version: z.string().max(64).optional(),
  })
  .strict();
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

export const ExplainRequestSchema = z
  .object({
    scenario: ScenarioInputSchema.optional(),
    question: z.string().max(500).nullable().optional(),
    run_filters: RunExplorerFilterSchema.optional(),
    selected_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
    compare_run_ids: z.array(z.string().min(1).max(64)).max(10).optional(),
    data_version: z.string().max(64).optional(),
    catalog_version: z.string().max(64).optional(),
  })
  .strict();
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

export interface RankingCriterionBreakdown {
  criterion:
    | "research_objective"
    | "material_and_geometry"
    | "conditions_and_setup"
    | "measured_outcome";
  weight: number;
  active: boolean;
  score: 0 | 0.5 | 1;
  status: "matched" | "partial" | "mismatched" | "unknown" | "omitted";
  unknown: boolean;
  reason: string;
  sub_criteria?: Array<{
    dimension: string;
    weight: number;
    score: 0 | 0.5 | 1;
    status: "matched" | "partial" | "mismatched" | "unknown";
    unknown: boolean;
    reason: string;
  }>;
}

export interface RankedInvestigationResult {
  investigation_id: string;
  title: string;
  study_relevance_score: number;
  relevance_label: string;
  data_depth: DataDepth;
  published_run_count: number | null;
  reviewed_run_count: number;
  is_proxy_experiment: boolean;
  pinned_for_rover_panel: boolean;
  direct_outcome_score: 0 | 0.5 | 1;
  breakdown: RankingCriterionBreakdown[];
  matching_conditions: string[];
  missing_or_mismatched_conditions: string[];
  research_lead: ResearchLead;
  source_ids: string[];
}

export interface ComparisonFieldRow {
  field_key: string;
  label: string;
  unit: string | null;
  run_a_value: string | number | null;
  run_b_value: string | number | null;
  display_a: string;
  display_b: string;
  status: ComparisonStatus;
}

export interface ConfounderWarning {
  type:
    | "oxygen"
    | "material_variant"
    | "rod_size"
    | "orientation_or_flow_direction"
    | "flow_protocol"
    | "ignition_protocol"
    | "facility_platform"
    | "repeated_burn_sample_history";
  severity: "warning" | "critical";
  message: string;
}

export interface RunComparisonResult {
  status: "compared" | "no_comparable_pair";
  reason?: string;
  run_a_id: string | null;
  run_b_id: string | null;
  summary_differences: string[];
  confounders: ConfounderWarning[];
  sections: {
    sample_and_apparatus: ComparisonFieldRow[];
    experimental_conditions: ComparisonFieldRow[];
    measured_quantities: ComparisonFieldRow[];
    outcomes: ComparisonFieldRow[];
  };
}

export interface ApplicabilityRow {
  parameter:
    | "gravity"
    | "oxygen_pct"
    | "pressure_kpa"
    | "airflow_cm_s"
    | "material_and_configuration"
    | "requested_outcome";
  target_display: string;
  measurement_basis: MeasurementBasis;
  study_comparisons: Array<{
    investigation_id: string;
    study_value_display: string;
    status: ApplicabilityStatus;
    reason: string;
  }>;
}

export interface ScenarioApplicabilityResult {
  preset_used: ScenarioPresetId | null;
  scenario_state: "evaluated" | "browse_or_insufficient_input";
  applied_scenario: ResolvedScenario;
  unset_fields: string[];
  combination_tested: boolean;
  matching_verified_run_ids: string[];
  approximate_match_run_ids: string[];
  combination_message: string;
  rows: ApplicabilityRow[];
  rover_panel_studies: string[];
  evidence_gap_summary: string;
  defer_predictive_interpolation_note: string;
}

// ============================================================================
// 4. Cited AI Explanation Schema
// ============================================================================

export const NumericFactSchema = z
  .object({
    label: z.string().min(1).max(120),
    value: z.number().finite(),
    unit: z.string().min(1).max(32),
    basis: MeasurementBasisSchema,
    evidence_id: z.string().min(1).max(64),
  })
  .strict();
export type NumericFact = z.infer<typeof NumericFactSchema>;

export const CitedClaimSchema = z
  .object({
    statement: z.string().min(1).max(600),
    evidence_ids: z.array(z.string().min(1).max(64)).min(1).max(10),
    source_ids: z.array(z.string().min(1).max(64)).min(1).max(10),
    numeric_facts: z.array(NumericFactSchema).max(10).optional(),
  })
  .strict();
export type CitedClaim = z.infer<typeof CitedClaimSchema>;

export const ExplanationResponseSchema = z
  .object({
    observed_findings: z.array(CitedClaimSchema).min(1).max(6),
    applicability_limits: z.array(CitedClaimSchema).min(1).max(6),
    missing_evidence: z.array(CitedClaimSchema).min(1).max(6),
    evidence_gap_warning: z.string().max(600).nullable(),
  })
  .strict();
export type ExplanationResponse = z.infer<typeof ExplanationResponseSchema>;
