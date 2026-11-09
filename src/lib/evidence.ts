// src/lib/evidence.ts
import {
  Catalog,
  Evidence,
  ExplanationResponse,
  ExplanationResponseSchema,
  RankedInvestigationResult,
  ResolvedScenario,
  RunComparisonResult,
  ScenarioApplicabilityResult,
  Source,
} from "./schema";
import { escapeHtml } from "./security";

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
  allowedSourceIds: ReadonlySet<string>;
  allowedNumbers: ReadonlySet<number>;
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
  const sourceIds = new Set<string>();
  const allowedNumbers = new Set<number>();

  const addEv = (eid: string) => {
    const resolved = resolveEvidenceById(eid, catalog);
    if (!resolved) return;
    evidenceIds.add(resolved.evidence_id);
    sourceIds.add(resolved.source_id);
    if (
      typeof resolved.normalized_value === "number" &&
      Number.isFinite(resolved.normalized_value)
    ) {
      allowedNumbers.add(resolved.normalized_value);
    }
    if (resolved.original_value !== null) {
      const parsedOrig = Number(resolved.original_value);
      if (Number.isFinite(parsedOrig)) {
        allowedNumbers.add(parsedOrig);
      }
    }
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

  // 2. If BASS-II is top-ranked or selected runs belong to BASS-II, include Figure 6.4 final O2 too
  if (relevantStudies.some((s) => s.investigation_id === "BASS-II")) {
    addEv("EV_BASSII_FIG64_SEQ");
    addEv("EV_BASSII_FIG64_FINAL");
    addEv("EV_BASSII_O15A");
    addEv("EV_BASSII_O15B");
    addEv("EV_PMMA_COHORT_24");
    allowedNumbers.add(9.525);
    allowedNumbers.add(4.7625);
    allowedNumbers.add(15.2);
    allowedNumbers.add(14.9);
    allowedNumbers.add(3.0);
    allowedNumbers.add(1.5);
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
  allowedNumbers.add(21.0);
  allowedNumbers.add(101.3);
  allowedNumbers.add(14.7);
  allowedNumbers.add(4.0);

  if (scenario.oxygen_pct !== null && scenario.oxygen_pct !== undefined) {
    allowedNumbers.add(scenario.oxygen_pct);
  }
  if (scenario.pressure_kpa !== null && scenario.pressure_kpa !== undefined) {
    allowedNumbers.add(scenario.pressure_kpa);
  }
  if (scenario.pressure_psia !== null && scenario.pressure_psia !== undefined) {
    allowedNumbers.add(scenario.pressure_psia);
  }
  if (scenario.airflow_cm_s !== null && scenario.airflow_cm_s !== undefined) {
    allowedNumbers.add(scenario.airflow_cm_s);
  }

  const evidenceMap: Record<string, BoundEvidenceCitation> = {};
  for (const eid of evidenceIds) {
    const resolved = resolveEvidenceById(eid, catalog);
    if (resolved) {
      evidenceMap[eid] = resolved;
    }
  }

  return {
    allowedEvidenceIds: evidenceIds,
    allowedSourceIds: sourceIds,
    allowedNumbers,
    evidenceMap,
  };
}

function unitsAreCompatible(unitA: string, unitB: string): boolean {
  const norm = (u: string) =>
    u
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/%o2|vol%|percent|pct/g, "%");
  return norm(unitA) === norm(unitB);
}

const URL_OR_MARKDOWN_LINK_REGEX =
  /(https?:\/\/[^\s)]+|\[[^\]]+\]\([^)]+\)|10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i;

function extractEmpiricalNumbersFromProse(statement: string): number[] {
  // Remove known non-measurement alphanumeric identifiers before scanning numbers
  const scrubbed = statement
    .replace(/\b(O15a|O15b|218m|BASS-II|Saffire-I|SAME-R|PSI-\d+|NTRS[\s-]*\d+|NASA\/TM-\d+|Figure\s+6\.4|Table\s+A\.5|1\/6\s*g|0\s*g|1\s*g)\b/gi, " ")
    .replace(/\b20(15|20|21|22|24|25|26)\b/g, " ");

  const matches = scrubbed.match(/\b\d+(?:\.\d+)?\b/g);
  if (!matches) return [];
  return matches
    .map((m) => Number(m))
    .filter((n) => Number.isFinite(n));
}

export function validateModelExplanation(
  rawCandidate: unknown,
  allowlist: CitationAllowlist
):
  | { valid: true; data: ExplanationResponse; bound_citations: BoundEvidenceCitation[] }
  | { valid: false; reason: string } {
  const parsed = ExplanationResponseSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    return {
      valid: false,
      reason: `Schema validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  const data = parsed.data;
  const allClaims = [
    ...data.observed_findings,
    ...data.applicability_limits,
    ...data.missing_evidence,
  ];

  const referencedEvidenceIds = new Set<string>();

  for (const claim of allClaims) {
    // 1. Reject raw URLs, markdown links, or inline DOIs in prose (links must be rendered from server-owned records)
    if (URL_OR_MARKDOWN_LINK_REGEX.test(claim.statement)) {
      return {
        valid: false,
        reason: `Rejected unallowed inline link, URL, or raw DOI in claim prose: "${claim.statement.slice(0, 80)}"`,
      };
    }

    // 2. Verify every evidence_id is in the request-scoped allowlist
    for (const evId of claim.evidence_ids) {
      if (!allowlist.allowedEvidenceIds.has(evId)) {
        return {
          valid: false,
          reason: `Rejected unknown or irrelevant evidence_id '${evId}' outside request allowlist.`,
        };
      }
      referencedEvidenceIds.add(evId);
    }

    // 3. Verify every source_id is in the request-scoped allowlist and matches the cited evidence_ids
    for (const srcId of claim.source_ids) {
      if (!allowlist.allowedSourceIds.has(srcId)) {
        return {
          valid: false,
          reason: `Rejected unknown or irrelevant source_id '${srcId}' outside request allowlist.`,
        };
      }
    }

    // 4. Validate numeric_facts: value AND unit must match the bound evidence record!
    if (claim.numeric_facts) {
      for (const nf of claim.numeric_facts) {
        if (!allowlist.allowedEvidenceIds.has(nf.evidence_id)) {
          return {
            valid: false,
            reason: `Numeric fact references unallowed evidence_id '${nf.evidence_id}'.`,
          };
        }
        const bound = allowlist.evidenceMap[nf.evidence_id];
        if (!bound) {
          return {
            valid: false,
            reason: `Missing bound evidence record for '${nf.evidence_id}'.`,
          };
        }

        const matchesNormalized =
          bound.normalized_value !== null &&
          Math.abs(bound.normalized_value - nf.value) <= 0.1;
        const origNum =
          bound.original_value !== null ? Number(bound.original_value) : NaN;
        const matchesOriginal =
          Number.isFinite(origNum) && Math.abs(origNum - nf.value) <= 0.1;

        if (!matchesNormalized && !matchesOriginal) {
          return {
            valid: false,
            reason: `Numeric fact value '${nf.value}' does not match bound evidence '${nf.evidence_id}' (expected ${bound.normalized_value} ${bound.normalized_unit} or ${bound.original_value} ${bound.original_unit}).`,
          };
        }

        // Enforce strict unit compatibility (reject right value with wrong unit!)
        const validNormUnit =
          matchesNormalized &&
          bound.normalized_unit !== null &&
          unitsAreCompatible(nf.unit, bound.normalized_unit);
        const validOrigUnit =
          matchesOriginal &&
          bound.original_unit !== null &&
          unitsAreCompatible(nf.unit, bound.original_unit);

        if (!validNormUnit && !validOrigUnit) {
          return {
            valid: false,
            reason: `Unit swap rejected on '${nf.evidence_id}': got '${nf.value} ${nf.unit}', expected unit '${bound.normalized_unit}' or '${bound.original_unit}'.`,
          };
        }

        // Enforce measurement basis match
        if (
          nf.basis !== bound.measurement_basis &&
          !(bound.measurement_basis === "final" && nf.basis === "endpoint") &&
          !(bound.measurement_basis === "endpoint" && nf.basis === "final")
        ) {
          return {
            valid: false,
            reason: `Measurement basis mismatch on '${nf.evidence_id}': got '${nf.basis}', expected '${bound.measurement_basis}'.`,
          };
        }
      }
    }

    // 5. Validate numbers appearing in prose statement against allowlist numbers
    const proseNumbers = extractEmpiricalNumbersFromProse(claim.statement);
    for (const pNum of proseNumbers) {
      const backed = Array.from(allowlist.allowedNumbers).some(
        (allowed) => Math.abs(allowed - pNum) <= 0.1
      );
      if (!backed) {
        return {
          valid: false,
          reason: `Unsupported number '${pNum}' in claim prose is not backed by the request's verified evidence.`,
        };
      }
    }
  }

  const boundCitations = Array.from(referencedEvidenceIds)
    .map((id) => allowlist.evidenceMap[id])
    .filter((c): c is BoundEvidenceCitation => Boolean(c));

  const sanitized: ExplanationResponse = {
    observed_findings: data.observed_findings.map((c) => ({
      ...c,
      statement: escapeHtml(c.statement),
    })),
    applicability_limits: data.applicability_limits.map((c) => ({
      ...c,
      statement: escapeHtml(c.statement),
    })),
    missing_evidence: data.missing_evidence.map((c) => ({
      ...c,
      statement: escapeHtml(c.statement),
    })),
    evidence_gap_warning: data.evidence_gap_warning
      ? escapeHtml(data.evidence_gap_warning)
      : null,
  };

  return {
    valid: true,
    data: sanitized,
    bound_citations: boundCitations,
  };
}

export function buildReviewedFallbackExplanation(
  scenario: ResolvedScenario,
  ranked: RankedInvestigationResult[],
  applicability: ScenarioApplicabilityResult,
  isSafeThresholdRequest: boolean
): ExplanationResponse {
  const topStudy = ranked[0];
  const topId = topStudy?.investigation_id ?? "BASS-II";

  const observedFindings: ExplanationResponse["observed_findings"] = [];

  if (topId === "Saffire-I") {
    observedFindings.push({
      statement: escapeHtml(
        "In Saffire-I aboard the uncrewed Cygnus spacecraft, a meter-scale SIBAL cotton-fiberglass fabric panel burned under 20 cm/s ventilation flow in microgravity, demonstrating steady large-scale flame spread and enclosure pressure rise."
      ),
      evidence_ids: ["EV_SAFFIRE_I_SUMMARY"],
      source_ids: ["SRC_SAFFIRE_I_PSI98"],
      numeric_facts: [
        {
          label: "Saffire-I Ventilation Airflow",
          value: 20.0,
          unit: "cm/s",
          basis: "nominal",
          evidence_id: "EV_SAFFIRE_I_SUMMARY",
        },
      ],
    });
  } else if (topId === "SAME-R") {
    observedFindings.push({
      statement: escapeHtml(
        "In SAME-R inside the ISS Microgravity Science Glovebox, thermal pyrolysis of spacecraft polymers in microgravity (~21.0% O2) produced larger aggregated smoke particle diameters than 1 g tests due to longer hot-zone residence time."
      ),
      evidence_ids: ["EV_SAMER_SUMMARY"],
      source_ids: ["SRC_SAMER_PSI101"],
      numeric_facts: [
        {
          label: "SAME-R Nominal Oxygen",
          value: 21.0,
          unit: "%",
          basis: "nominal",
          evidence_id: "EV_SAMER_SUMMARY",
        },
      ],
    });
  } else if (topId === "FLEX") {
    observedFindings.push({
      statement: escapeHtml(
        "In FLEX inside the ISS Combustion Integrated Rack, isolated liquid heptane and methanol droplets (proxy droplet geometry) were burned down to 15.0% O2 under inert-gas dilution to quantify radiative quenching and cool-flame behavior."
      ),
      evidence_ids: ["EV_FLEX_SUMMARY"],
      source_ids: ["SRC_FLEX_PSI69"],
      numeric_facts: [
        {
          label: "FLEX Minimum Tested Oxygen",
          value: 15.0,
          unit: "%",
          basis: "initial",
          evidence_id: "EV_FLEX_SUMMARY",
        },
      ],
    });
  } else {
    observedFindings.push({
      statement: escapeHtml(
        "In BASS-II concurrent-flow tests on the ISS (24 published cohort runs), stepping forced airflow down in Figure 6.4 caused flame weakening and quenching as oxygen decreased from 14.8% initially to 13.6% finally, while candidate Table A.5 runs O15a (15.6% initial O2) and O15b (15.2% initial O2) burned clear 9.525 mm PMMA rod sample 218m."
      ),
      evidence_ids: [
        "EV_BASSII_FIG64_SEQ",
        "EV_BASSII_FIG64_FINAL",
        "EV_BASSII_O15A",
        "EV_BASSII_O15B",
        "EV_PMMA_COHORT_24",
      ],
      source_ids: [
        "SRC_BASSII_TM2021",
        "SRC_BASSII_PSI25",
        "SRC_PMMA_CONCURRENT_PAPER",
      ],
      numeric_facts: [
        {
          label: "Initial Oxygen (Figure 6.4)",
          value: 14.8,
          unit: "%",
          basis: "initial",
          evidence_id: "EV_BASSII_FIG64_SEQ",
        },
        {
          label: "Final Oxygen (Figure 6.4)",
          value: 13.6,
          unit: "%",
          basis: "final",
          evidence_id: "EV_BASSII_FIG64_FINAL",
        },
      ],
    });
  }

  const applicabilityLimits: ExplanationResponse["applicability_limits"] = [
    {
      statement: escapeHtml(
        "Candidate runs O15a and O15b in BASS-II Table A.5 shared physical sample 218m (repeated-burn history), experienced flow changes during the tests, and left run-level pressure unreported. In LUCI, a 4 mm acrylic rod and cotton-fiberglass fabric burned simultaneously aboard a rotating New Shepard sounding rocket (~1/6 g) in normal-pressure air (21.0% O2), so oxygen readings apply at shared-chamber scope."
      ),
      evidence_ids: ["EV_BASSII_O15A", "EV_BASSII_O15B", "EV_LUCI_SUMMARY"],
      source_ids: ["SRC_BASSII_TM2021", "SRC_LUCI_NTRS2025"],
      numeric_facts: [
        {
          label: "LUCI Acrylic Rod Diameter",
          value: 4.0,
          unit: "mm",
          basis: "nominal",
          evidence_id: "EV_LUCI_SUMMARY",
        },
      ],
    },
  ];

  const missingEvidence: ExplanationResponse["missing_evidence"] = [
    {
      statement: escapeHtml(
        `${applicability.combination_message} Within this collection, no verified test simultaneously covers PMMA at ~1/6 g lunar partial gravity in the proposed 34.0% O2, 8.2 psia (56.5 kPa) exploration atmosphere. Predictive interpolation between microgravity and 1 g is deferred because buoyant convection at 0.167 g can extend flammability beyond microgravity limits.`
      ),
      evidence_ids: [
        "EV_EXPLORATION_ATM_2024",
        "EV_EXPLORATION_ATM_O2",
        "EV_PARTIAL_G_REVIEW",
      ],
      source_ids: ["SRC_EXPLORATION_ATM_2024", "SRC_PARTIAL_G_REVIEW"],
      numeric_facts: [
        {
          label: "Exploration Atmosphere Oxygen Assumption",
          value: 34.0,
          unit: "%",
          basis: "assumed",
          evidence_id: "EV_EXPLORATION_ATM_O2",
        },
        {
          label: "Exploration Atmosphere Pressure Assumption",
          value: 56.5,
          unit: "kPa",
          basis: "assumed",
          evidence_id: "EV_EXPLORATION_ATM_2024",
        },
      ],
    },
  ];

  const gapWarning = isSafeThresholdRequest
    ? escapeHtml(
        "EVIDENCE GAP WARNING: This collection cannot certify a 'safe cabin oxygen setting' or guaranteed non-flammable threshold. The curated NASA studies report experimental observations under specific test geometries and atmospheres; partial-gravity flammability at ~1/6 g and 34% O2 / 56.5 kPa can extend beyond microgravity limits and requires dedicated experimental verification."
      )
    : scenario.gravity_regime === "lunar_1_6g"
    ? escapeHtml(applicability.evidence_gap_summary)
    : null;

  return {
    observed_findings: observedFindings,
    applicability_limits: applicabilityLimits,
    missing_evidence: missingEvidence,
    evidence_gap_warning: gapWarning,
  };
}
