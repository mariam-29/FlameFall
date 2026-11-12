import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("Vercel Express entrypoint", () => {
  it("serves the health route through the exported application", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.catalog_version).toBeTruthy();
  });

  it("preserves evaluate and explain API routes", async () => {
    await request(app)
      .post("/api/evaluate")
      .send({ question: "NASA acrylic fire behavior in orbit" })
      .expect(200);

    const explanation = await request(app)
      .post("/api/explain")
      .send({ question: "Summarize evidence on NASA acrylic fire behavior" })
      .expect(200);
    expect(explanation.body.mode).toBe("reviewed_fallback");
  });

  it("serves checked-in export artifacts", async () => {
    const response = await request(app).get("/api/export/manifest").expect(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body.catalog_version).toBeTruthy();
  });
});
