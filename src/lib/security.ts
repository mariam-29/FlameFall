// src/lib/security.ts
import { ScenarioInput } from "./schema";

export const MAX_PAYLOAD_BYTES = 16 * 1024; // 16 KiB hard limit (16,384 bytes)
const PSIA_TO_KPA = 6.894757;

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function stripControlAndHtml(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 500);
}

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+|previous\s+|prior\s+|above\s+|earlier\s+)?instructions/i,
  /disregard\s+(all\s+|previous\s+|prior\s+|system\s+)?instructions/i,
  /override\s+(system|safety|citation)\s+(prompt|rules|instructions)/i,
  /system\s*prompt/i,
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+an?\s+unrestricted/i,
  /cite\s+(a\s+)?fake\s+doi/i,
  /10\.9999\//i,
  /https?:\/\//i,
  /javascript:/i,
  /<\s*script/i,
];

export function detectPromptInjection(question: string | null | undefined): {
  flagged: boolean;
  reason: string | null;
} {
  if (!question) {
    return { flagged: false, reason: null };
  }
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(question)) {
      return {
        flagged: true,
        reason: `Input matched adversarial or unallowed pattern (${pattern.source}).`,
      };
    }
  }
  return { flagged: false, reason: null };
}

const SAFE_LIMIT_QUERY_PATTERNS: readonly RegExp[] = [
  /safe\s+(cabin|oxygen|pressure|airflow|ventilation|atmosphere|rover|spacecraft)\s*(setting|limit|threshold|level|concentration|percentage|value)?/i,
  /what\s+(is|are)\s+the\s+safe\s+(limit|level|setting|threshold|oxygen|pressure|airflow)/i,
  /guaranteed\s+(safe|not\s+to\s+burn|threshold|extinction|non-flammable)/i,
  /certify\s+(safe|flammability|cabin)/i,
  /maximum\s+safe\s+(oxygen|o2|airflow|pressure)/i,
  /at\s+what\s+oxygen\s+level\s+is\s+it\s+safe/i,
  /will\s+not\s+(burn|ignite)\s+safely/i,
  /interpolate\s+(between|flammability|partial\s+gravity|safe)/i,
  /predict\s+exact\s+(safe|extinction)\s+boundary/i,
];

export function detectUnsupportedSafeLimitQuery(
  question: string | null | undefined
): boolean {
  if (!question) return false;
  return SAFE_LIMIT_QUERY_PATTERNS.some((re) => re.test(question));
}

export function parseScenarioFromFreeText(
  question: string | null | undefined,
  currentScenario: ScenarioInput,
  explicitOverrides: ReadonlySet<string> = new Set()
): ScenarioInput {
  if (!question) return currentScenario;
  const cleaned = stripControlAndHtml(question).toLowerCase();
  const next: ScenarioInput = { ...currentScenario };

  // Task detection if not explicitly set
  if (!next.task && !explicitOverrides.has("task")) {
    if (/\b(smoke|particle\s*size|detector|aerosol|same-r|daft)\b/.test(cleaned)) {
      next.task = "smoke_detection";
    } else if (
      /\b(suppress|suppression|dilution|extinguish|droplet|flex|heptane|methanol)\b/.test(
        cleaned
      )
    ) {
      next.task = "suppression";
    } else if (
      /\b(larger?\s+fabric|larger?\s+fire|fire\s+spread|cygnus|saffire|scale|enclosure\s+fire)\b/.test(
        cleaned
      )
    ) {
      next.task = "larger_fire_spread";
    } else if (
      /\b(acrylic|pmma|airflow|ventilation|bass-ii|quench|blowoff|rod)\b/.test(
        cleaned
      )
    ) {
      next.task = "materials_and_ventilation";
    }
  }

  // Material synonym matching
  if (!next.material && !explicitOverrides.has("material")) {
    if (/\b(pmma|acrylic|plexiglas|polymethyl\s*methacrylate)\b/.test(cleaned)) {
      next.material = "PMMA";
      if (!next.geometry_shape && !explicitOverrides.has("geometry_shape")) {
        next.geometry_shape = "rod";
      }
    } else if (/\b(sibal|cotton|fiberglass|fabric)\b/.test(cleaned)) {
      next.material = "cotton_fiberglass";
      if (!next.geometry_shape && !explicitOverrides.has("geometry_shape")) {
        next.geometry_shape = "flat_sheet";
      }
    } else if (/\b(heptane|methanol|liquid[\s-]*droplet|droplet)\b/.test(cleaned)) {
      next.material = "heptane";
      if (!next.geometry_shape && !explicitOverrides.has("geometry_shape")) {
        next.geometry_shape = "droplet";
      }
    }
  }

  // Gravity regime synonym matching
  if (!next.gravity_regime && !explicitOverrides.has("gravity_regime")) {
    if (/\b(lunar|moon|rover|1\/6\s*g|one-sixth|partial\s*gravity|luci)\b/.test(cleaned)) {
      next.gravity_regime = "lunar_1_6g";
    } else if (/\b(iss|microgravity|0\s*g|freefall|orbital)\b/.test(cleaned)) {
      next.gravity_regime = "microgravity";
    }
  }

  // Outcome synonym matching
  if (!next.requested_outcome && !explicitOverrides.has("requested_outcome")) {
    if (/\b(smoke\s*particle\s*size|particle\s*size|moment\s*average)\b/.test(cleaned)) {
      next.requested_outcome = "smoke_particle_size";
    } else if (/\b(gas\s*dilution|droplet\s*extinction|suppressant)\b/.test(cleaned)) {
      next.requested_outcome = "droplet_extinction";
    } else if (/\b(large\s*scale|flame\s*spread\s*rate|pressure\s*rise)\b/.test(cleaned)) {
      next.requested_outcome = "large_scale_flame_spread";
    } else if (/\b(quench|quenching)\b/.test(cleaned)) {
      next.requested_outcome = "quenching";
    } else if (/\b(blowoff|blow-off)\b/.test(cleaned)) {
      next.requested_outcome = "blowoff";
    }
  }

  // Numeric oxygen extraction (e.g. "34% oxygen" or "14.8% O2")
  if (
    next.oxygen_pct === undefined &&
    !explicitOverrides.has("oxygen_pct")
  ) {
    const o2Match = cleaned.match(/(\d+(?:\.\d+)?)\s*%\s*(?:o2|oxygen)/i);
    if (o2Match) {
      const val = Number(o2Match[1]);
      if (Number.isFinite(val) && val >= 0 && val <= 100) {
        next.oxygen_pct = val;
      }
    }
  }

  // Numeric pressure extraction (e.g. "8.2 psia" or "56.5 kpa")
  if (
    next.pressure_kpa === undefined &&
    next.pressure_psia === undefined &&
    !explicitOverrides.has("pressure_kpa") &&
    !explicitOverrides.has("pressure_psia")
  ) {
    const psiaMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*psia\b/i);
    const kpaMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*kpa\b/i);
    if (kpaMatch) {
      const val = Number(kpaMatch[1]);
      if (Number.isFinite(val) && val >= 0 && val <= 500) {
        next.pressure_kpa = val;
        next.pressure_psia = Math.round((val / PSIA_TO_KPA) * 100) / 100;
      }
    } else if (psiaMatch) {
      const val = Number(psiaMatch[1]);
      if (Number.isFinite(val) && val >= 0 && val <= 75) {
        next.pressure_psia = val;
        next.pressure_kpa = Math.round(val * PSIA_TO_KPA * 10) / 10;
      }
    }
  }

  return next;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
}

// Configurable token-bucket for local/host boundary testing alongside upstream WAF/Upstash headers
const ipWindowCounters = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimitStateForTests(): void {
  ipWindowCounters.clear();
}

export function checkServerlessRateLimit(
  headers: Record<string, string | string[] | undefined>,
  clientIp = "127.0.0.1"
): RateLimitCheckResult {
  const rawUpstash = headers["x-upstash-ratelimit-remaining"];
  const rawStandard = headers["x-ratelimit-remaining"];
  const remainingHeader = Array.isArray(rawUpstash)
    ? rawUpstash[0]
    : rawUpstash ?? (Array.isArray(rawStandard) ? rawStandard[0] : rawStandard);

  if (remainingHeader !== undefined) {
    const remaining = Number(remainingHeader);
    if (Number.isFinite(remaining) && remaining <= 0) {
      return {
        allowed: false,
        reason: "rate_limit_exceeded: upstream x-ratelimit-remaining <= 0",
      };
    }
  }

  const maxPerWindow = Number(process.env.PUBLIC_RATE_LIMIT_MAX ?? "0");
  if (Number.isFinite(maxPerWindow) && maxPerWindow > 0) {
    const now = Date.now();
    const windowMs = Number(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS ?? "60000");
    const entry = ipWindowCounters.get(clientIp);
    if (!entry || now >= entry.resetAt) {
      ipWindowCounters.set(clientIp, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > maxPerWindow) {
        return {
          allowed: false,
          reason: `rate_limit_exceeded: exceeded ${maxPerWindow} requests per window`,
        };
      }
    }
  }

  return { allowed: true };
}

export function logSafeOperationalMetric(metric: {
  request_id: string;
  endpoint: string;
  latency_ms: number;
  mode: "live_ai" | "reviewed_fallback" | "deterministic";
  fallback_reason: string | null;
  catalog_version: string;
}): void {
  if (process.env.NODE_ENV !== "test") {
    console.info(JSON.stringify(metric));
  }
}
