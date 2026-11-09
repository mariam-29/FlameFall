// src/server.ts
import { app } from "./app";
import { getCatalog } from "./lib/catalog";

const PORT = Number(process.env.PORT ?? "4000");

const catalog = getCatalog();

app.listen(PORT, () => {
  console.info(
    `[Flame Trace Express Backend] Listening on http://localhost:${PORT} | catalog_version=${catalog.catalog_version} | verified_runs=${catalog.counts.verified_runs} | phases=${catalog.counts.phases}`
  );
});
