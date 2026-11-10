// src/controllers/explain.controller.ts
import crypto from "crypto";
import { Request, Response } from "express";
import {
  getAiTimeoutMs,
  getGeminiApiKey,
  isForceFallbackMode,
} from "../config/env";
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
  buildReviewedFallbackExplanation,
  getAIProviderAdapter,
  resolveEvidenceById,
  validateModelExplanation,
} from "../lib/evidence";
import { rankInvestigations } from "../lib/rank";
import {
  ExplainRequestSchema,
  ExplanationResponse,
} from "../lib/schema";
import {
  checkServerlessRateLimit,
  detectPromptInjection,
  detectUnsupportedSafeLimitQuery,
  logSafeOperationalMetric,
} from "../lib/security";
import { validateVersionAndIds } from "../middlewares/jsonBody.middleware";
import {
  callLiveGeminiProvider,
  ProviderAdapter,
} from "../services/gemini.service";

export interface ExplainControllerOptions {
  providerAdapter?: ProviderAdapter;
}

export function createExplainController(options?: ExplainControllerOptions) {
  return async function postExplainController(
    req: Request,
    res: Response
  ): Promise<void> {
    const startMs = performance.now();
    const requestId = crypto.randomUUID();
    const catalog = getCatalog();

    const securityHeaders = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, max-age=0",
    };

    const parsedReq = ExplainRequestSchema.safeParse(req.body);
    if (!parsedReq.success) {
      res
        .status(400)
        .set(securityHeaders)
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

    const rawQuestionText = question ?? rawScenario?.question ?? null;
    const injectionCheck = detectPromptInjection(rawQuestionText);
    const isSafeLimitQuery = detectUnsupportedSafeLimitQuery(rawQuestionText);

    // Step 1 (Parse): Resolve scenario deterministically
    const resolvedScenario = resolveScenario(
      rawScenario,
      question,
      selected_run_ids ?? compare_run_ids,
      catalog
    );

    // Step 2 (Retrieve): Recompute deterministic ranking, comparison, coverage & allowlist
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

    const forceFallback = isForceFallbackMode();
    const apiKey = getGeminiApiKey();
    const customAdapter = options?.providerAdapter ?? getAIProviderAdapter();
    const clientIp =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : undefined) ??
      req.ip ??
      "127.0.0.1";
    const rateLimit = checkServerlessRateLimit(req.headers, clientIp);

    let mode: "live_ai" | "reviewed_fallback" = "reviewed_fallback";
    let providerModeDetail:
      | "live_provider"
      | "simulated_provider_adapter"
      | "deterministic_fallback" = "deterministic_fallback";
    let fallbackReason: string | null = null;
    let finalExplanation: ExplanationResponse;
    let boundCitations: BoundEvidenceCitation[] = [];

    if (injectionCheck.flagged) {
      fallbackReason = `adversarial_input_blocked: ${injectionCheck.reason}`;
      finalExplanation = buildReviewedFallbackExplanation(
        resolvedScenario,
        rankedInvestigations,
        applicability,
        true
      );
    } else if (forceFallback) {
      fallbackReason = "force_fallback_mode_enabled";
      finalExplanation = buildReviewedFallbackExplanation(
        resolvedScenario,
        rankedInvestigations,
        applicability,
        isSafeLimitQuery
      );
    } else if (!rateLimit.allowed) {
      fallbackReason = rateLimit.reason ?? "rate_limit_exceeded";
      finalExplanation = buildReviewedFallbackExplanation(
        resolvedScenario,
        rankedInvestigations,
        applicability,
        isSafeLimitQuery
      );
    } else if (!apiKey && !customAdapter) {
      fallbackReason = "missing_ai_api_key";
      finalExplanation = buildReviewedFallbackExplanation(
        resolvedScenario,
        rankedInvestigations,
        applicability,
        isSafeLimitQuery
      );
    } else {
      // Step 3 & 4: Invoke provider (custom adapter or live Gemini) with 5500ms timeout and validate
      try {
        const providerFn = customAdapter ?? callLiveGeminiProvider;
        const { rawOutput, simulated } = await providerFn({
          scenario: resolvedScenario,
          ranked: rankedInvestigations,
          applicability,
          allowlist,
          apiKey,
          timeoutMs: getAiTimeoutMs(),
        });

        const validation = validateModelExplanation(rawOutput, allowlist);
        if (validation.valid) {
          mode = "live_ai";
          providerModeDetail = simulated
            ? "simulated_provider_adapter"
            : "live_provider";
          finalExplanation = validation.data;
          boundCitations = validation.bound_citations;

          // Guarantee that safe-cabin threshold requests ALWAYS emit evidence_gap_warning even in live_ai mode
          if (isSafeLimitQuery && !finalExplanation.evidence_gap_warning) {
            finalExplanation.evidence_gap_warning =
              buildReviewedFallbackExplanation(
                resolvedScenario,
                rankedInvestigations,
                applicability,
                true
              ).evidence_gap_warning;
          }
        } else {
          fallbackReason = `model_validation_rejected: ${validation.reason}`;
          finalExplanation = buildReviewedFallbackExplanation(
            resolvedScenario,
            rankedInvestigations,
            applicability,
            isSafeLimitQuery
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "unknown_provider_error";
        fallbackReason = `provider_error_or_timeout: ${msg}`;
        finalExplanation = buildReviewedFallbackExplanation(
          resolvedScenario,
          rankedInvestigations,
          applicability,
          isSafeLimitQuery
        );
      }
    }

    if (boundCitations.length === 0) {
      const fallbackEvIds = new Set<string>();
      for (const c of [
        ...finalExplanation.observed_findings,
        ...finalExplanation.applicability_limits,
        ...finalExplanation.missing_evidence,
      ]) {
        for (const eid of c.evidence_ids) {
          fallbackEvIds.add(eid);
        }
      }
      boundCitations = Array.from(fallbackEvIds)
        .map((id) => resolveEvidenceById(id, catalog))
        .filter((item): item is BoundEvidenceCitation => item !== null);
    }

    const latencyMs = Math.round((performance.now() - startMs) * 100) / 100;
    logSafeOperationalMetric({
      request_id: requestId,
      endpoint: "/api/explain",
      latency_ms: latencyMs,
      mode,
      fallback_reason: fallbackReason,
      catalog_version: catalog.catalog_version,
    });

    res.status(200).set(securityHeaders).json({
      mode,
      provider_mode_detail: providerModeDetail,
      fallback_reason: fallbackReason,
      catalog_version: catalog.catalog_version,
      resolved_scenario: resolvedScenario,
      parsed_scenario: resolvedScenario,
      ranked_investigations: rankedInvestigations,
      applicability,
      run_comparison: runComparison,
      explanation: finalExplanation,
      citations: boundCitations,
      evidence_map: allowlist.evidenceMap,
      latency_ms: latencyMs,
    });
  };
}

export const postExplainController = createExplainController();
