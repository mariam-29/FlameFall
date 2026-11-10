// src/app.ts
/**
 * NASA Space Apps — Flame Trace: Fire Safety in Space
 * Express Application Factory & Backward-Compatible Module Barrel
 *
 * Layered HTTP Architecture:
 * - src/config/env.ts
 * - src/middlewares/securityHeaders.middleware.ts
 * - src/middlewares/jsonBody.middleware.ts
 * - src/services/gemini.service.ts
 * - src/controllers/{health,evaluate,explain,export}.controller.ts
 * - src/routes/api.routes.ts
 */

import express from "express";
import {
  getCandidateGeminiModels,
  loadDotEnvIfPresent,
  sanitizeEnvValue,
} from "./config/env";
import {
  strictJsonBodyMiddleware,
  validateVersionAndIds,
} from "./middlewares/jsonBody.middleware";
import {
  corsMiddleware,
  securityHeadersMiddleware,
} from "./middlewares/securityHeaders.middleware";
import { createApiRouter } from "./routes/api.routes";
import {
  callLiveGeminiProvider,
  ProviderAdapter,
} from "./services/gemini.service";

loadDotEnvIfPresent();

export interface CreateAppOptions {
  providerAdapter?: ProviderAdapter;
}

export function createApp(options?: CreateAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(corsMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(strictJsonBodyMiddleware);

  app.use("/api", createApiRouter(options));

  return app;
}

export const app = createApp();

export {
  callLiveGeminiProvider,
  getCandidateGeminiModels,
  loadDotEnvIfPresent,
  ProviderAdapter,
  sanitizeEnvValue,
  strictJsonBodyMiddleware,
  validateVersionAndIds,
};
