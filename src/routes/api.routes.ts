// src/routes/api.routes.ts
import { Router } from "express";
import { postEvaluateController } from "../controllers/evaluate.controller";
import {
  createExplainController,
  ExplainControllerOptions,
} from "../controllers/explain.controller";
import { getExportController } from "../controllers/export.controller";
import { getHealthController } from "../controllers/health.controller";

export function createApiRouter(options?: ExplainControllerOptions): Router {
  const router = Router();

  router.get("/health", getHealthController);
  router.post("/evaluate", postEvaluateController);
  router.post("/explain", createExplainController(options));
  router.get("/export/:type", getExportController);

  return router;
}
