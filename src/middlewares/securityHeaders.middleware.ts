// src/middlewares/securityHeaders.middleware.ts
import cors from "cors";
import { NextFunction, Request, RequestHandler, Response } from "express";

export const corsMiddleware: RequestHandler = cors({
  exposedHeaders: [
    "Content-Disposition",
    "X-Catalog-Version",
    "X-Catalog-SHA256",
    "X-Runs-Count",
    "X-Phases-Count",
  ],
});

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
