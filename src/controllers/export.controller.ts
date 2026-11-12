// src/controllers/export.controller.ts
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { getCatalog } from "../lib/catalog";

export const ALLOWED_EXPORTS: Readonly<
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

export function getExportController(req: Request, res: Response): void {
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
}
