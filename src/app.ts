// src/app.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { findRunByIdOrOriginal, getCatalog } from "./lib/catalog";
import {
  checkScenarioApplicability,
  compareRuns,
  filterRuns,
  resolveScenario,
} from "./lib/coverage";
import {
  BoundEvidenceCitation,
  buildGroundedContextAndAllowlist,
  buildReviewedFallbackExplanation,
  CitationAllowlist,
  getAIProviderAdapter,
  resolveEvidenceById,
  resolveEvidenceForRecord,
  validateModelExplanation,
} from "./lib/evidence";
import { rankInvestigations } from "./lib/rank";
import {
  EvaluateRequestSchema,
  ExplainRequestSchema,
  ExplanationResponse,
  RankedInvestigationResult,
  ResolvedScenario,
  ScenarioApplicabilityResult,
} from "./lib/schema";
import {
  checkServerlessRateLimit,
  detectPromptInjection,
  detectUnsupportedSafeLimitQuery,
  logSafeOperationalMetric,
  MAX_PAYLOAD_BYTES,
} from "./lib/security";

const AI_TIMEOUT_MS = 5500;

async function callLiveGeminiProvider(args: {
  scenario: ResolvedScenario;
  ranked: RankedInvestigationResult[];
  applicability: ScenarioApplicabilityResult;
  allowlist: CitationAllowlist;
  apiKey: string;
  timeoutMs: number;
}): Promise<{ rawOutput: unknown; simulated: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const allowedEvidenceSummary = Array.from(
      args.allowlist.allowedEvidenceIds
    ).map((id) => {
      const item = args.allowlist.evidenceMap[id];
      return {
        evidence_id: id,
        source_id: item?.source_id,
        record_id: item?.record_id,
        scope: item?.scope,
        field_name: item?.field_name,
        reviewed_fact: item?.reviewed_fact,
        original_value: item?.original_value,
        original_unit: item?.original_unit,
        normalized_value: item?.normalized_value,
        normalized_unit: item?.normalized_unit,
        measurement_basis: item?.measurement_basis,
      };
    });

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const systemInstruction = [
      "You are the NASA Flame Trace Scientific Evidence Synthesis Engine.",
      "CRITICAL RULES:",
      "1. You may ONLY cite evidence_ids and source_ids from ALLOWED_EVIDENCE.",
      "2. NEVER include raw URLs, markdown links, or inline DOIs in statement strings.",
      "3. Every number in statement prose or numeric_facts MUST match the exact value and unit from ALLOWED_EVIDENCE.",
      "4. Never treat null/unknown values as matching. Keep ISS microgravity, drop tower, and LUCI sounding-rocket shared-chamber results distinct.",
      "5. If asked for a safe cabin setting or threshold, populate evidence_gap_warning.",
      "6. Output strictly valid JSON matching: { observed_findings: [...], applicability_limits: [...], missing_evidence: [...], evidence_gap_warning: string | null }.",
    ].join("\n");

    const promptPayload = JSON.stringify({
      resolved_scenario: args.scenario,
      top_ranked_studies: args.ranked.slice(0, 3).map((r) => ({
        investigation_id: r.investigation_id,
        score: r.study_relevance_score,
        research_lead: r.research_lead,
      })),
      combination_tested: args.applicability.combination_tested,
      combination_message: args.applicability.combination_message,
      ALLOWED_EVIDENCE: allowedEvidenceSummary,
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: promptPayload }] }],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Upstream model HTTP ${response.status}`);
    }

    const resultJson = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText =
      resultJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return {
      rawOutput: JSON.parse(rawText),
      simulated: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Raw stream body parser that strictly caps payload size at 16 KiB (16,384 bytes)
 * even when the client omits or spoofs the Content-Length header.
 */
function strictJsonBodyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method !== "POST") {
    next();
    return;
  }

  const contentLengthHeader = req.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
      res
        .status(413)
        .set("X-Content-Type-Options", "nosniff")
        .json({ error: "Payload exceeds 16 KiB maximum limit." });
      return;
    }
  }

  // If pre-parsed by test harness, still verify serialized byte length
  if (
    req.body &&
    typeof req.body === "object" &&
    Object.keys(req.body as Record<string, unknown>).length > 0 &&
    (req as unknown as { _readableState?: { endEmitted?: boolean } })
      ._readableState?.endEmitted
  ) {
    const serializedBytes = Buffer.byteLength(JSON.stringify(req.body), "utf8");
    if (serializedBytes > MAX_PAYLOAD_BYTES) {
      res
        .status(413)
        .set("X-Content-Type-Options", "nosniff")
        .json({ error: "Payload exceeds 16 KiB maximum limit." });
      return;
    }
    next();
    return;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let aborted = false;

  req.on("data", (chunk: Buffer | string) => {
    if (aborted) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    totalBytes += buf.length;
    if (totalBytes > MAX_PAYLOAD_BYTES) {
      aborted = true;
      res
        .status(413)
        .set("X-Content-Type-Options", "nosniff")
        .json({ error: "Payload exceeds 16 KiB maximum limit." });
      req.destroy();
      return;
    }
    chunks.push(buf);
  });

  req.on("end", () => {
    if (aborted) return;
    const rawStr = Buffer.concat(chunks).toString("utf8").trim();
    if (!rawStr) {
      req.body = {};
      next();
      return;
    }
    try {
      req.body = JSON.parse(rawStr);
      next();
    } catch {
      res
        .status(400)
        .set("X-Content-Type-Options", "nosniff")
        .json({ error: "Invalid JSON payload." });
    }
  });

  req.on("error", () => {
    if (!aborted && !res.headersSent) {
      res
        .status(400)
        .set("X-Content-Type-Options", "nosniff")
        .json({ error: "Stream read error." });
    }
  });
}

function validateVersionAndIds(
  reqData: {
    data_version?: string;
    catalog_version?: string;
    selected_run_ids?: string[];
    scenario?: { selected_run_ids?: string[] };
    run_filters?: { investigation_id?: string };
  },
  res: Response
): boolean {
  const catalog = getCatalog();
  const requestedVersion = reqData.catalog_version ?? reqData.data_version;

  if (requestedVersion && requestedVersion !== catalog.catalog_version) {
    res
      .status(409)
      .set("X-Content-Type-Options", "nosniff")
      .json({
        error: "Stale or mismatched catalog_version.",
        expected_version: catalog.catalog_version,
        received_version: requestedVersion,
      });
    return false;
  }

  const unknownIds: string[] = [];
  const allSelectedIds = [
    ...(reqData.selected_run_ids ?? []),
    ...(reqData.scenario?.selected_run_ids ?? []),
  ];

  for (const rid of allSelectedIds) {
    const foundRun = findRunByIdOrOriginal(rid, catalog);
    const foundFig = catalog.phases.some(
      (p) => p.figure_id?.toLowerCase() === rid.toLowerCase()
    );
    if (!foundRun && !foundFig) {
      unknownIds.push(rid);
    }
  }

  if (reqData.run_filters?.investigation_id) {
    const invExists = catalog.investigations.some(
      (i) =>
        i.id.toLowerCase() ===
        reqData.run_filters!.investigation_id!.toLowerCase()
    );
    if (!invExists) {
      unknownIds.push(reqData.run_filters.investigation_id);
    }
  }

  if (unknownIds.length > 0) {
    res
      .status(404)
      .set("X-Content-Type-Options", "nosniff")
      .json({
        error: `Unknown record ID(s): ${unknownIds.join(", ")}`,
        unknown_ids: unknownIds,
      });
    return false;
  }

  return true;
}

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(strictJsonBodyMiddleware);

  // ==========================================================================
  // 1. POST /api/evaluate — Instant Deterministic Evaluation (< 5 ms)
  // ==========================================================================
  app.post("/api/evaluate", (req: Request, res: Response) => {
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
      run_filters,
    } = parsedReq.data;

    const resolvedScenario = resolveScenario(
      rawScenario,
      question,
      selected_run_ids,
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
  });

  // ==========================================================================
  // 2. POST /api/explain — Grounded 5-Step AI Pipeline + Instant Fallback
  // ==========================================================================
  app.post("/api/explain", async (req: Request, res: Response) => {
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
      run_filters,
    } = parsedReq.data;

    const rawQuestionText = question ?? rawScenario?.question ?? null;
    const injectionCheck = detectPromptInjection(rawQuestionText);
    const isSafeLimitQuery = detectUnsupportedSafeLimitQuery(rawQuestionText);

    // Step 1 (Parse): Resolve scenario deterministically
    const resolvedScenario = resolveScenario(
      rawScenario,
      question,
      selected_run_ids,
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

    const forceFallback = process.env.FORCE_FALLBACK_MODE === "true";
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY ?? "";
    const customAdapter = getAIProviderAdapter();
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
          timeoutMs: AI_TIMEOUT_MS,
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
  });

  // ==========================================================================
  // 3. GET /api/export/:type — Verified CSV & Manifest Researcher Downloads
  // ==========================================================================
  const ALLOWED_EXPORTS: Readonly<
    Record<string, { filename: string; contentType: string }>
  > = Object.freeze({
    runs: {
      filename: "runs.csv",
      contentType: "text/csv; charset=utf-8",
    },
    phases: {
      filename: "phases.csv",
      contentType: "text/csv; charset=utf-8",
    },
    dictionary: {
      filename: "data_dictionary.json",
      contentType: "application/json; charset=utf-8",
    },
    manifest: {
      filename: "manifest.json",
      contentType: "application/json; charset=utf-8",
    },
  });

  app.get("/api/export/:type", (req: Request, res: Response) => {
    const type = String(req.params.type ?? "");
    const spec = ALLOWED_EXPORTS[type];

    if (!spec) {
      res
        .status(404)
        .set("X-Content-Type-Options", "nosniff")
        .json({
          error: `Unknown export type '${type}'. Allowed types: runs, phases, dictionary, manifest.`,
        });
      return;
    }

    const catalog = getCatalog();
    const filePath = path.join(
      process.cwd(),
      "public",
      "exports",
      spec.filename
    );

    if (!fs.existsSync(filePath)) {
      res
        .status(404)
        .set("X-Content-Type-Options", "nosniff")
        .json({
          error: `Export file '${spec.filename}' not found. Run npm run build:data first.`,
        });
      return;
    }

    const content = fs.readFileSync(filePath, "utf-8");

    res
      .status(200)
      .set({
        "Content-Type": spec.contentType,
        "Content-Disposition": `attachment; filename="flame-trace-${catalog.catalog_version}-${spec.filename}"`,
        "X-Catalog-Version": catalog.catalog_version,
        "X-Catalog-SHA256": catalog.sha256_hash,
        "X-Runs-Count": String(catalog.counts.verified_runs),
        "X-Phases-Count": String(catalog.counts.phases),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=3600",
      })
      .send(content);
  });

  // ==========================================================================
  // 4. GET /api/health — Catalog Integrity & AI Mode Readiness Check
  // ==========================================================================
  app.get("/api/health", (_req: Request, res: Response) => {
    const catalog = getCatalog();
    const hasAiKey = Boolean(
      process.env.GEMINI_API_KEY || process.env.AI_API_KEY
    );
    const forceFallback = process.env.FORCE_FALLBACK_MODE === "true";

    res
      .status(200)
      .set("X-Content-Type-Options", "nosniff")
      .json({
        status: "ok",
        catalog_version: catalog.catalog_version,
        sha256_hash: catalog.sha256_hash,
        generated_at: catalog.generated_at,
        counts: catalog.counts,
        ai_mode_configured:
          hasAiKey && !forceFallback
            ? "live_ai_ready"
            : "reviewed_fallback_only",
        exports: {
          runs_csv: "/api/export/runs",
          phases_csv: "/api/export/phases",
          data_dictionary_json: "/api/export/dictionary",
          manifest_json: "/api/export/manifest",
        },
      });
  });

  return app;
}

export const app = createApp();
