// src/controllers/evaluate.controller.ts
import crypto from "node:crypto";
import { Request, Response } from "express";
import { getCatalog } from "../lib/catalog";
import {
  checkScenarioApplicability,
  compareRuns,
  filterRuns,
  resolveScenario,
} from "../lib/coverage";
import {
  BoundEvidenceCitation,
  buildGroundedContextAndAllowlist,
  resolveEvidenceById,
  resolveEvidenceForRecord,
} from "../lib/evidence";
import { rankInvestigations } from "../lib/rank";
import { EvaluateRequestSchema } from "../lib/schema";
import { logSafeOperationalMetric } from "../lib/security";
import { validateVersionAndIds } from "../middlewares/jsonBody.middleware";

export function postEvaluateController(req: Request, res: Response): void {
  const startMs = performance.now();
  const requestId = crypto.randomUUID();
  const catalog = getCatalog();

  const parsedReq = EvaluateRequestSchema.safeParse(req.body);
  if (!parsedReq.success) {
    res
      .status(400)
      .set("X-Content-Type-Options", "nosniff")
      .json({
        error: "Request schema validation failed.",
        issues: parsedReq.error.issues,
      });
    return;
  }

  if (!validateVersionAndIds(parsedReq.data, res)) {
    return;
  }

  const {
    scenario: rawScenario,
    question,
    selected_run_ids,
    compare_run_ids,
    run_filters,
  } = parsedReq.data;

  const resolvedScenario = resolveScenario(
    rawScenario,
    question,
    selected_run_ids ?? compare_run_ids,
    catalog
  );

  const rankedInvestigations = rankInvestigations(resolvedScenario, catalog);
  const applicability = checkScenarioApplicability(resolvedScenario, catalog);

  const hasActiveRunFilters = Boolean(
    run_filters && Object.keys(run_filters).length > 0
  );
  const filteredRuns = hasActiveRunFilters
    ? filterRuns(run_filters!, catalog)
    : filterRuns({}, catalog);

  const pinIds = resolvedScenario.selected_run_ids ?? [];
  const runComparison =
    pinIds.length >= 2
      ? compareRuns(
          pinIds[0],
          pinIds[1],
          catalog,
          hasActiveRunFilters ? filteredRuns : undefined
        )
      : compareRuns(null, null, catalog);

  const allowlist = buildGroundedContextAndAllowlist(
    resolvedScenario,
    rankedInvestigations,
    applicability,
    runComparison,
    catalog
  );

  // Build evidence drawers for runs, figure sequences, and investigations
  const evidenceDrawers: Record<string, BoundEvidenceCitation[]> = {};
  for (const r of catalog.runs) {
    evidenceDrawers[r.run_id] = resolveEvidenceForRecord(r.run_id, catalog);
    evidenceDrawers[r.original_run_id] = evidenceDrawers[r.run_id];
  }
  evidenceDrawers["FIG_6_4"] = resolveEvidenceForRecord("FIG_6_4", catalog);
  for (const inv of catalog.investigations) {
    evidenceDrawers[inv.id] = inv.research_lead.evidence_ids
      .map((eid) => resolveEvidenceById(eid, catalog))
      .filter((item): item is BoundEvidenceCitation => item !== null);
  }

  const latencyMs = Math.round((performance.now() - startMs) * 100) / 100;
  logSafeOperationalMetric({
    request_id: requestId,
    endpoint: "/api/evaluate",
    latency_ms: latencyMs,
    mode: "deterministic",
    fallback_reason: null,
    catalog_version: catalog.catalog_version,
  });

  res
    .status(200)
    .set({
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    })
    .json({
      catalog_version: catalog.catalog_version,
      sha256_hash: catalog.sha256_hash,
      counts: catalog.counts,
      resolved_scenario: resolvedScenario,
      parsed_scenario: resolvedScenario,
      ranked_investigations: rankedInvestigations,
      filtered_runs: filteredRuns,
      run_comparison: runComparison,
      applicability,
      joint_match: {
        combination_tested: applicability.combination_tested,
        matching_verified_run_ids: applicability.matching_verified_run_ids,
        approximate_match_run_ids: applicability.approximate_match_run_ids,
        message: applicability.combination_message,
      },
      phases: catalog.phases,
      evidence_drawers: evidenceDrawers,
      evidence_map: allowlist.evidenceMap,
      exclusions: catalog.exclusions,
      latency_ms: latencyMs,
    });
}
