/**
 * Vercel Express entrypoint. Vercel invokes the exported application per
 * request; local development and `npm start` continue to use server.ts.
 */
import { app } from "./app";

export default app;
