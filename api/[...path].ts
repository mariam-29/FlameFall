/**
 * Vercel's explicit API function entrypoint. Keep the app implementation in
 * src/index.ts so Vercel never treats the app factory in src/app.ts as a
 * standalone serverless module.
 */
export { default } from "../src/index";
