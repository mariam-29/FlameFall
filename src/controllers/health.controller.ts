// src/controllers/health.controller.ts
import { Request, Response } from "express";
import { getGeminiApiKey, isForceFallbackMode } from "../config/env";
import { getCatalog } from "../lib/catalog";

export function getHealthController(_req: Request, res: Response): void {
  const catalog = getCatalog();
  const hasAiKey = Boolean(getGeminiApiKey());
  const forceFallback = isForceFallbackMode();

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
}
