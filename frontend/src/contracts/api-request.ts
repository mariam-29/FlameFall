import { z } from 'zod';

// Frontend-local mirror of the request contracts in src/lib/schema.ts.
// Keep these strict request shapes and enum values in sync with the backend.
// This file stays under frontend/ so Vercel's frontend-only install can resolve zod.

export const TaskTagSchema = z.enum([
  'materials_and_ventilation',
  'larger_fire_spread',
  'smoke_detection',
  'suppression',
]);

export const GravityRegimeSchema = z.enum([
  'microgravity',
  'lunar_1_6g',
  'martian_0_38g',
  'earth_1g',
  'partial_g_other',
]);

export const FacilityPlatformSchema = z.enum([
  'ISS_MGBX',
  'Drop_Tower',
  'Sounding_Rocket_New_Shepard',
  'Cygnus_Spacecraft',
  'ISS_CIR',
]);

export const FlowDirectionSchema = z.enum([
  'concurrent',
  'opposed',
  'none',
  'unknown',
]);

export const FlowProtocolSchema = z.enum([
  'fixed',
  'staged',
  'changing_during_test',
  'unknown',
]);

export const ObservedOutcomeSchema = z.enum([
  'quenching',
  'blowoff',
  'sustained_burning',
  'failed_sustained_ignition',
  'unclassified_test_end',
  'unknown',
]);

export const ScenarioPresetIdSchema = z.enum([
  'iss_acrylic_experiment',
  'iss_acrylic',
  'iss_acrylic_benchmark',
  'illustrative_lunar_rover',
  'lunar_rover',
  'custom_scenario',
  'custom',
]);

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
