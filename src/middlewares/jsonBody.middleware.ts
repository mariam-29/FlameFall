// src/middlewares/jsonBody.middleware.ts
import { NextFunction, Request, Response } from "express";
import { findRunByIdOrOriginal, getCatalog } from "../lib/catalog";
import { MAX_PAYLOAD_BYTES } from "../lib/security";

/**
 * Raw stream body parser that strictly caps payload size at 16 KiB (16,384 bytes)
 * even when the client omits or spoofs the Content-Length header.
 */
export function strictJsonBodyMiddleware(
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
    const serializedBytes = Buffer.byteLength(
      JSON.stringify(req.body),
      "utf8"
    );
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

export function validateVersionAndIds(
  reqData: {
    data_version?: string;
    catalog_version?: string;
    selected_run_ids?: string[];
    compare_run_ids?: string[];
    scenario?: { selected_run_ids?: string[]; compare_run_ids?: string[] };
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
    ...(reqData.compare_run_ids ?? []),
    ...(reqData.scenario?.selected_run_ids ?? []),
    ...(reqData.scenario?.compare_run_ids ?? []),
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
