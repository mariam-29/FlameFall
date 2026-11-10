// src/services/gemini.service.ts
import { getCandidateGeminiModels, sanitizeEnvValue } from "../config/env";
import { AIProviderAdapter, CitationAllowlist } from "../lib/evidence";
import {
  RankedInvestigationResult,
  ResolvedScenario,
  ScenarioApplicabilityResult,
} from "../lib/schema";

export type ProviderAdapter = AIProviderAdapter;

export async function callLiveGeminiProvider(args: {
  scenario: ResolvedScenario;
  ranked: RankedInvestigationResult[];
  applicability: ScenarioApplicabilityResult;
  allowlist: CitationAllowlist;
  apiKey: string;
  timeoutMs: number;
}): Promise<{ rawOutput: unknown; simulated: boolean }> {
  const cleanApiKey = sanitizeEnvValue(args.apiKey);
  const allowedEvidenceIds = Array.from(args.allowlist.allowedEvidenceIds);
  const allowedSourceIds = Array.from(args.allowlist.allowedSourceIds);
  const allowedNumbers = Array.from(args.allowlist.allowedNumbers);

  const allowedEvidenceSummary = allowedEvidenceIds.map((id) => {
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

  const systemInstruction = [
    "You are the NASA Flame Trace Scientific Evidence Synthesis Engine.",
    "Return a compact JSON object with EXACTLY these 4 keys:",
    '{ "observed_findings": [{ "statement": "...", "evidence_ids": ["..."], "source_ids": ["..."] }], "applicability_limits": [{ "statement": "...", "evidence_ids": ["..."], "source_ids": ["..."] }], "missing_evidence": [{ "statement": "...", "evidence_ids": ["..."], "source_ids": ["..."] }], "evidence_gap_warning": null }',
    "CRITICAL RULES:",
    `1. Each array (observed_findings, applicability_limits, missing_evidence) must have 1 or 2 concise items. You may ONLY use evidence_ids from: ${JSON.stringify(allowedEvidenceIds)} and source_ids from: ${JSON.stringify(allowedSourceIds)}.`,
    "2. NEVER include raw URLs, markdown links, or inline DOIs in statement strings.",
    `3. In statement strings, ONLY use exact numerical digits that appear in ALLOWED_NUMBERS: ${JSON.stringify(allowedNumbers)} (or write words instead of digits). Paraphrase directly from reviewed_fact in ALLOWED_EVIDENCE.`,
    "4. Never treat null/unknown values as matching. Keep ISS microgravity, drop tower, and LUCI sounding-rocket shared-chamber results distinct.",
    "5. Set evidence_gap_warning to null unless the user asks for a safe cabin setting or threshold.",
  ].join("\n");

  const promptPayload = JSON.stringify({
    resolved_scenario: args.scenario,
    combination_tested: args.applicability.combination_tested,
    combination_message: args.applicability.combination_message,
    ALLOWED_NUMBERS: allowedNumbers,
    ALLOWED_EVIDENCE: allowedEvidenceSummary,
  });

  const candidateModels = getCandidateGeminiModels(process.env.GEMINI_MODEL);
  const perModelTimeoutMs = Math.min(Math.max(args.timeoutMs, 4000), 5000);
  let lastErrorMsg = "Unknown upstream provider error";

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perModelTimeoutMs);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          modelName
        )}:generateContent?key=${encodeURIComponent(cleanApiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: promptPayload }] }],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 600,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      );

      if (response.ok) {
        const resultJson = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText =
          resultJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return {
          rawOutput: JSON.parse(rawText),
          simulated: false,
        };
      }

      lastErrorMsg = `Upstream model ${modelName} HTTP ${response.status}`;
      if (
        response.status !== 404 &&
        response.status !== 503 &&
        response.status !== 429
      ) {
        break;
      }
    } catch (err) {
      lastErrorMsg =
        err instanceof Error
          ? `${modelName}: ${err.message}`
          : `${modelName}: request failed`;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(lastErrorMsg);
}
