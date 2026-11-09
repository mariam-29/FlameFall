// src/lib/catalog.ts
import fs from "node:fs";
import path from "node:path";
import {
  Catalog,
  CatalogSchema,
  Evidence,
  Investigation,
  Phase,
  Run,
  Source,
} from "./schema";

export interface CatalogIndices {
  catalog: Readonly<Catalog>;
  sourcesById: ReadonlyMap<string, Readonly<Source>>;
  investigationsById: ReadonlyMap<string, Readonly<Investigation>>;
  runsById: ReadonlyMap<string, Readonly<Run>>;
  runsByOriginalId: ReadonlyMap<string, Readonly<Run>>;
  phasesByRunId: ReadonlyMap<string, readonly Readonly<Phase>[]>;
  phasesByFigureId: ReadonlyMap<string, readonly Readonly<Phase>[]>;
  evidenceById: ReadonlyMap<string, Readonly<Evidence>>;
}

let cachedSingleton: CatalogIndices | null = null;

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
  }
  return obj;
}

export function getCatalogIndices(): CatalogIndices {
  if (cachedSingleton !== null) {
    return cachedSingleton;
  }

  const catalogPath = path.join(
    process.cwd(),
    "data",
    "generated",
    "catalog.json"
  );
  const rawJson = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  const validated = CatalogSchema.parse(rawJson);
  const frozenCatalog = deepFreeze(validated);

  const sourcesById = new Map<string, Readonly<Source>>();
  for (const s of frozenCatalog.sources) {
    sourcesById.set(s.id, s);
  }

  const investigationsById = new Map<string, Readonly<Investigation>>();
  for (const inv of frozenCatalog.investigations) {
    investigationsById.set(inv.id, inv);
  }

  const runsById = new Map<string, Readonly<Run>>();
  const runsByOriginalId = new Map<string, Readonly<Run>>();
  for (const r of frozenCatalog.runs) {
    runsById.set(r.run_id, r);
    runsByOriginalId.set(r.original_run_id, r);
    runsByOriginalId.set(r.original_run_id.toUpperCase(), r);
    runsByOriginalId.set(r.original_run_id.toLowerCase(), r);
  }

  const phasesByRunId = new Map<string, Readonly<Phase>[]>();
  const phasesByFigureId = new Map<string, Readonly<Phase>[]>();
  for (const p of frozenCatalog.phases) {
    if (p.run_id) {
      const list = phasesByRunId.get(p.run_id) ?? [];
      list.push(p);
      phasesByRunId.set(p.run_id, list);
    }
    if (p.figure_id) {
      const fList = phasesByFigureId.get(p.figure_id) ?? [];
      fList.push(p);
      phasesByFigureId.set(p.figure_id, fList);
    }
  }

  const evidenceById = new Map<string, Readonly<Evidence>>();
  for (const ev of frozenCatalog.evidence) {
    evidenceById.set(ev.evidence_id, ev);
  }

  cachedSingleton = Object.freeze({
    catalog: frozenCatalog,
    sourcesById,
    investigationsById,
    runsById,
    runsByOriginalId,
    phasesByRunId,
    phasesByFigureId,
    evidenceById,
  });

  return cachedSingleton;
}

export function getCatalog(): Readonly<Catalog> {
  return getCatalogIndices().catalog;
}

export function findRunByIdOrOriginal(
  id: string,
  catalog?: Readonly<Catalog>
): Readonly<Run> | undefined {
  if (!catalog || catalog === cachedSingleton?.catalog) {
    const indices = getCatalogIndices();
    return (
      indices.runsById.get(id) ??
      indices.runsByOriginalId.get(id) ??
      indices.runsByOriginalId.get(id.toUpperCase())
    );
  }
  return catalog.runs.find(
    (r) =>
      r.run_id.toLowerCase() === id.toLowerCase() ||
      r.original_run_id.toLowerCase() === id.toLowerCase()
  );
}
