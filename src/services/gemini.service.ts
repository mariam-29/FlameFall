// src/services/gemini.service.ts
import { getCandidateGeminiModels, sanitizeEnvValue } from "../config/env";
import { AIProviderAdapter, buildModelExplanationJsonSchema, CitationAllowlist } from "../lib/evidence";
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
  const systemInstruction = [
    "Select reviewed evidence for a Flame Trace explanation.",
    'Return exactly this JSON shape: {"observed_findings":["EVIDENCE_ID"],"applicability_limits":["EVIDENCE_ID"],"missing_evidence":["EVIDENCE_ID"]}.',
    "Choose one or two distinct IDs per section using only the supplied evidence IDs.",
    "Use experimental observations for findings and records that explain the scenario mismatch or evidence gap for the other sections.",
    "Keep ISS microgravity, drop tower, and LUCI sounding-rocket shared-chamber evidence distinct.",
    "The server renders the reviewed text, measurements, and sources for each selected ID.",
  ].join("\n");

  const promptPayload = JSON.stringify({
    resolved_scenario: args.scenario,
    combination_tested: args.applicability.combination_tested,
    combination_message: args.applicability.combination_message,
    evidence: Object.values(args.allowlist.evidenceMap).map(
      ({ evidence_id, scope, reviewed_fact, measurement_basis }) => ({
        evidence_id,
        scope,
        reviewed_fact,
        measurement_basis,
      })
    ),
  });

  const candidateModels = getCandidateGeminiModels(process.env.GEMINI_MODEL);
  const responseJsonSchema = buildModelExplanationJsonSchema(args.allowlist);
  const controller = new AbortController();
  const timeoutError = new Error(`Gemini deadline exceeded after ${args.timeoutMs}ms`);
  const timeoutId = setTimeout(() => controller.abort(timeoutError), args.timeoutMs);
  let lastErrorMsg = "Unknown upstream provider error";

  try {
    for (const modelName of candidateModels) {
      controller.signal.throwIfAborted();
      const thinkingLevel = modelName === "gemini-3.8-flash" ? "LOW"
        : /^gemini-3\.[15]-flash-lite$/.test(modelName) ? "MINIMAL" : undefined;
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": cleanApiKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: "user", parts: [{ text: promptPayload }] }],
              generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 600,
                responseMimeType: "application/json",
                responseJsonSchema,
                ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
              },
            }),
          }
        );

        if (response.ok) {
          const resultJson = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
          };
          controller.signal.throwIfAborted();
          const rawText = resultJson.candidates?.[0]?.content?.parts
            ?.filter((part) => !part.thought)
            .map((part) => part.text ?? "")
            .join("") ?? "";
          return { rawOutput: JSON.parse(rawText), simulated: false };
        }

        lastErrorMsg = `Upstream model ${modelName} HTTP ${response.status}`;
        if (response.body) await response.body.cancel();
        if (![404, 429, 503].includes(response.status)) break;
      } catch (err) {
        controller.signal.throwIfAborted();
        lastErrorMsg =
          err instanceof Error
            ? `${modelName}: ${err.message}`
            : `${modelName}: request failed`;
      }
    }

    controller.signal.throwIfAborted();
    throw new Error(lastErrorMsg);
  } finally {
    clearTimeout(timeoutId);
  }
}
