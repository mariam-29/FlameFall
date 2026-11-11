// src/config/env.ts
import fs from "node:fs";
import path from "node:path";

export function sanitizeEnvValue(raw: string | undefined): string {
  if (!raw) return "";
  let val = raw.replace(/\r/g, "").trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

export function loadDotEnvIfPresent(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    const isTestEnv = Boolean(process.env.VITEST);
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\r/g, "").trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = sanitizeEnvValue(line.slice(eqIdx + 1));
      if (val.length > 0 && (!isTestEnv || process.env[key] === undefined)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env parse errors
  }
}

loadDotEnvIfPresent();

export function getPort(): number {
  const parsed = Number(sanitizeEnvValue(process.env.PORT));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

export function getGeminiApiKey(): string {
  return sanitizeEnvValue(
    process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY
  );
}

export function getGeminiModel(): string {
  return sanitizeEnvValue(process.env.GEMINI_MODEL) || "gemini-3.1-flash-lite";
}

export function isForceFallbackMode(): boolean {
  return sanitizeEnvValue(process.env.FORCE_FALLBACK_MODE) === "true";
}

export function getAiTimeoutMs(): number {
  const parsed = Number(sanitizeEnvValue(process.env.AI_TIMEOUT_MS));
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647
    ? parsed
    : 5500;
}

export function getCandidateGeminiModels(
  rawModelEnv: string | undefined = process.env.GEMINI_MODEL
): string[] {
  const cleaned = sanitizeEnvValue(rawModelEnv).replace(/^models\//i, "");
  const isLegacyRetired =
    !cleaned || /^gemini-(1\.5|2\.0|2\.5)\b/i.test(cleaned);
  const preferred = isLegacyRetired ? "gemini-3.1-flash-lite" : cleaned;
  const fallbacks = [
    preferred,
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ];
  return Array.from(new Set(fallbacks));
}
