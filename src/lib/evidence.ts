import { z } from "zod";
// src/lib/evidence.ts
import {
  Catalog,
  Evidence,
  ExplanationResponse,
  CitedClaim,
  RankedInvestigationResult,
  ResolvedScenario,
  Run,
  RunComparisonResult,
  ScenarioApplicabilityResult,
} from "./schema";
import {
  detectUnsupportedSafeLimitQuery,
  escapeHtml,
} from "./security";

export interface BoundEvidenceCitation {
  evidence_id: string;
  source_id: string;
  source_title: string;
  source_url: string;
  doi_or_ntrs_id: string;
  record_id: string;
  record_type: Evidence["record_type"];
  scope: Evidence["scope"];
  field_name: string;
  printed_page: string | null;
  pdf_page: string | null;
  page_display: string;
  locator_detail: string;
  reviewed_fact: string;
  original_value: string | null;
  original_unit: string | null;
  normalized_value: number | null;
  normalized_unit: string | null;
  measurement_basis: Evidence["measurement_basis"];
  quality_flag: Evidence["quality_flag"];
}

export interface CitationAllowlist {
  allowedEvidenceIds: ReadonlySet<string>;
  evidenceMap: Record<string, BoundEvidenceCitation>;
}

export type AIProviderAdapter = (args: {
  scenario: ResolvedScenario;
  ranked: RankedInvestigationResult[];
  applicability: ScenarioApplicabilityResult;
  allowlist: CitationAllowlist;
  apiKey: string;
  timeoutMs: number;
}) => Promise<{ rawOutput: unknown; simulated: boolean }>;

let customProviderAdapter: AIProviderAdapter | null = null;

export function setAIProviderAdapterForTests(
  adapter: AIProviderAdapter | null
): void {
  customProviderAdapter = adapter;
}

export function getAIProviderAdapter(): AIProviderAdapter | null {
  return customProviderAdapter;
}

export function resolveEvidenceById(
  evidenceId: string,
  catalog: Catalog
): BoundEvidenceCitation | null {
  const ev = catalog.evidence.find((e) => e.evidence_id === evidenceId);
  if (!ev) return null;
  const src = catalog.sources.find((s) => s.id === ev.source_id);
  if (!src) return null;

  const pageDisplay =
    ev.printed_page && ev.pdf_page && ev.printed_page !== ev.pdf_page
      ? `Printed p. ${ev.printed_page} (PDF p. ${ev.pdf_page})`
      : ev.printed_page
      ? `Printed p. ${ev.printed_page}`
      : ev.pdf_page
      ? `PDF p. ${ev.pdf_page}`
      : "Locator in source metadata";

  return {
    evidence_id: ev.evidence_id,
    source_id: ev.source_id,
    source_title: src.title,
    source_url: src.url,
    doi_or_ntrs_id: src.doi_or_ntrs_id,
    record_id: ev.record_id,
    record_type: ev.record_type,
    scope: ev.scope,
    field_name: ev.field_name,
    printed_page: ev.printed_page,
    pdf_page: ev.pdf_page,
    page_display: pageDisplay,
    locator_detail: ev.locator_detail,
    reviewed_fact: ev.reviewed_fact,
    original_value: ev.original_value,
    original_unit: ev.original_unit,
    normalized_value: ev.normalized_value,
    normalized_unit: ev.normalized_unit,
    measurement_basis: ev.measurement_basis,
    quality_flag: ev.quality_flag,
  };
}

export function resolveEvidenceForRecord(
  recordId: string,
  catalog: Catalog
): BoundEvidenceCitation[] {
  return catalog.evidence
    .filter((e) => e.record_id.toLowerCase() === recordId.toLowerCase())
    .map((e) => resolveEvidenceById(e.evidence_id, catalog))
    .filter((item): item is BoundEvidenceCitation => item !== null);
}

/**
 * Builds a request-scoped allowlist containing ONLY the evidence relevant
 * to the resolved scenario, top-ranked studies, selected runs, and applicability gaps.
 * Unrelated study evidence is excluded so citing valid-but-irrelevant evidence IDs fails validation.
 */
export function buildGroundedContextAndAllowlist(
  scenario: ResolvedScenario,
  ranked: RankedInvestigationResult[],
  applicability: ScenarioApplicabilityResult,
  comparison: RunComparisonResult | null,
  catalog: Catalog
): CitationAllowlist {
  const evidenceIds = new Set<string>();
  const evidenceMap: Record<string, BoundEvidenceCitation> = {};

  const addEv = (eid: string) => {
    const resolved = resolveEvidenceById(eid, catalog);
    if (!resolved) return;
    evidenceIds.add(eid);
    evidenceMap[eid] = resolved;
  };

  // 1. Add evidence for top-ranked study and any study pinned for rover panel
  const relevantStudies = ranked.filter(
    (r, idx) => idx === 0 || r.pinned_for_rover_panel
  );
  for (const st of relevantStudies) {
    for (const eid of st.research_lead.evidence_ids) {
      addEv(eid);
    }
  }

  // 2. If BASS-II is top-ranked, lunar rover context is active, or safe-limit query is asked, include BASS-II benchmark evidence
  if (
    relevantStudies.some((s) => s.investigation_id === "BASS-II") ||
    scenario.gravity_regime === "lunar_1_6g" ||
    detectUnsupportedSafeLimitQuery(scenario.question)
  ) {
    addEv("EV_BASSII_FIG64_SEQ");
    addEv("EV_BASSII_FIG64_FINAL");
    addEv("EV_BASSII_O15A");
    addEv("EV_BASSII_O15B");
    addEv("EV_PMMA_COHORT_24");
  }

  // 3. Add evidence for explicitly selected/compared runs
  if (comparison && comparison.status === "compared") {
    for (const r of catalog.runs) {
      if (
        r.run_id === comparison.run_a_id ||
        r.run_id === comparison.run_b_id
      ) {
        for (const eid of r.evidence_ids) {
          addEv(eid);
        }
      }
    }
  }

  // 4. Always include applicability & partial-gravity gap evidence so missing_evidence claims are grounded
  addEv("EV_LUCI_SUMMARY");
  addEv("EV_EXPLORATION_ATM_2024");
  addEv("EV_EXPLORATION_ATM_O2");
  addEv("EV_PARTIAL_G_REVIEW");
  return { allowedEvidenceIds: evidenceIds, evidenceMap };
}

const MAX_EVIDENCE_PER_SECTION = 6;
const EvidenceSelectionSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(MAX_EVIDENCE_PER_SECTION);

const ModelExplanationSchema = z.object({
  observed_findings: EvidenceSelectionSchema,
  applicability_limits: EvidenceSelectionSchema,
  missing_evidence: EvidenceSelectionSchema,
}).strict();

export function buildModelExplanationJsonSchema(allowlist: CitationAllowlist) {
  const sections = Object.keys(ModelExplanationSchema.shape);
  const selection = {
    type: "array",
    minItems: 1,
    maxItems: MAX_EVIDENCE_PER_SECTION,
    items: { type: "string", enum: Array.from(allowlist.allowedEvidenceIds) },
  };
  return {
    type: "object",
    properties: Object.fromEntries(sections.map((section) => [section, selection])),
    required: sections,
    additionalProperties: false,
  };
}

function renderEvidenceClaim(evidence: BoundEvidenceCitation): CitedClaim {
  const { evidence_id, source_id, reviewed_fact, normalized_value, normalized_unit } =
    evidence;
  return {
    statement: escapeHtml(reviewed_fact),
    evidence_ids: [evidence_id],
    source_ids: [source_id],
    ...(normalized_value !== null && normalized_unit
      ? {
          numeric_facts: [{
            label: evidence.field_name.replace(/_/g, " "),
            value: normalized_value,
            unit: normalized_unit,
            basis: evidence.measurement_basis,
            evidence_id,
          }],
        }
      : {}),
  };
}

export function validateModelExplanation(
  rawCandidate: unknown,
  allowlist: CitationAllowlist
):
  | { valid: true; data: ExplanationResponse; bound_citations: BoundEvidenceCitation[] }
  | { valid: false; reason: string } {
  const parsed = ModelExplanationSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    return { valid: false, reason: "Invalid model evidence selection." };
  }

  const { observed_findings, applicability_limits, missing_evidence } = parsed.data;
  const citedIds = new Set([...observed_findings, ...applicability_limits, ...missing_evidence]);
  const boundCitations: BoundEvidenceCitation[] = [];
  for (const id of citedIds) {
    if (!allowlist.allowedEvidenceIds.has(id)) {
      return {
        valid: false,
        reason: `Rejected unknown or irrelevant evidence_id '${id}' outside request allowlist.`,
      };
    }
    boundCitations.push(allowlist.evidenceMap[id]);
  }

  const renderSection = (ids: string[]) =>
    Array.from(new Set(ids), (id) => renderEvidenceClaim(allowlist.evidenceMap[id]));

  return {
    valid: true,
    data: {
      observed_findings: renderSection(observed_findings),
      applicability_limits: renderSection(applicability_limits),
      missing_evidence: renderSection(missing_evidence),
      evidence_gap_warning: null,
    },
    bound_citations: boundCitations,
  };
}

export function buildReviewedFallbackExplanation(args: {
  scenario: ResolvedScenario;
  ranked: RankedInvestigationResult[];
  applicability: ScenarioApplicabilityResult;
  selectedRuns: readonly Run[];
  comparison: RunComparisonResult;
  catalog: Catalog;
  isSafeThresholdRequest: boolean;
}): ExplanationResponse {
  const { scenario, ranked, applicability, selectedRuns, comparison, catalog } = args;
  const browsing = scenario.scenario_state === "browse_or_insufficient_input";
  const selectedStudyIds = new Set(selectedRuns.map((run) => run.investigation_id));
  const topStudy = browsing ? undefined : ranked[0];
  const studies = ranked.filter((study) =>
    study === topStudy ||
    selectedStudyIds.has(study.investigation_id) ||
    (topStudy?.investigation_id === "BASS-II" && study.pinned_for_rover_panel)
  );

  const findings = new Set(selectedRuns.flatMap((run) => run.evidence_ids));
  if (topStudy) {
    for (const id of topStudy.research_lead.evidence_ids) findings.add(id);
    if (topStudy.investigation_id === "BASS-II") findings.add("EV_BASSII_FIG64_FINAL");
  }
  const observed_findings = Array.from(findings)
    .map((id) => resolveEvidenceById(id, catalog))
    .filter((evidence): evidence is BoundEvidenceCitation => evidence !== null)
    .slice(0, 6)
    .map(renderEvidenceClaim);

  const applicability_limits = studies.map((study) => {
    const { evidence_ids } = study.research_lead;
    const investigation = catalog.investigations.find((item) => item.id === study.investigation_id);
    const limitation = study.investigation_id === "BASS-II" && scenario.gravity_regime !== "lunar_1_6g"
      ? investigation?.limitations ?? study.research_lead.limitation
      : study.research_lead.limitation;
    const citations = evidence_ids
      .map((id) => resolveEvidenceById(id, catalog))
      .filter((evidence): evidence is BoundEvidenceCitation => evidence !== null);
    return {
      statement: escapeHtml(limitation),
      evidence_ids: citations.map((evidence) => evidence.evidence_id),
      source_ids: Array.from(new Set(citations.map((evidence) => evidence.source_id))),
    };
  });
  if (comparison.status === "compared") {
    for (const warning of comparison.confounders) {
      applicability_limits.push({
        statement: escapeHtml(warning.message),
        evidence_ids: [],
        source_ids: [],
      });
    }
  }

  const gaps = new Set<string>();
  if (!browsing && [
    scenario.material, scenario.geometry_shape, scenario.requested_outcome,
    scenario.gravity_regime, scenario.oxygen_pct, scenario.pressure_kpa, scenario.airflow_cm_s,
  ].some((value) => value !== null && value !== undefined && value !== "")) {
    gaps.add(applicability.combination_message);
  }
  for (const study of studies) {
    for (const reason of study.missing_or_mismatched_conditions) {
      gaps.add(`${study.investigation_id}: ${reason}`);
    }
    if (study.reviewed_run_count === 0) {
      gaps.add(`The catalog has study-level evidence for ${study.investigation_id} and no verified run records for a run-level match.`);
    }
  }
  if (scenario.material?.toLowerCase() === "heptane" &&
      studies.some((study) => study.investigation_id === "FLEX")) {
    gaps.add("The reviewed FLEX comparison covers methanol droplets. It does not provide a heptane comparison.");
  }
  if (comparison.status === "no_comparable_pair" &&
      (scenario.selected_run_ids?.length ?? 0) >= 2 && comparison.reason) {
    gaps.add(comparison.reason);
  }

  return {
    observed_findings,
    applicability_limits: applicability_limits.slice(0, 6),
    missing_evidence: Array.from(gaps).slice(0, 6).map((statement) => ({
      statement: escapeHtml(statement),
      evidence_ids: [],
      source_ids: [],
    })),
    evidence_gap_warning: buildReviewedEvidenceGapWarning(
      scenario, applicability, args.isSafeThresholdRequest
    ),
  };
}

export function buildReviewedEvidenceGapWarning(
  scenario: ResolvedScenario,
  applicability: ScenarioApplicabilityResult,
  isSafeThresholdRequest: boolean
): string | null {
  if (isSafeThresholdRequest) {
    return escapeHtml(
      "EVIDENCE GAP WARNING: This collection cannot certify a safe cabin setting or guaranteed non-flammable threshold. The curated NASA studies report observations under specific test geometries and atmospheres. A safety threshold for the proposed conditions requires dedicated verification."
    );
  }
  if (scenario.gravity_regime !== "lunar_1_6g" || applicability.combination_tested) {
    return null;
  }
  const matchesRoverConditions =
    scenario.material?.toLowerCase() === "pmma" &&
    scenario.oxygen_pct === 34 &&
    scenario.pressure_kpa === 56.5;
  return escapeHtml(matchesRoverConditions
    ? applicability.evidence_gap_summary
    : applicability.combination_message);
}
