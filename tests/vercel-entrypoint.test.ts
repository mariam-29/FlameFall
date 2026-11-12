import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../api/[...path]";
import exportApp from "../api/export/[type]";

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

  it("serves nested export routes through the explicit Vercel export function", async () => {
    const expectations = [
      ["manifest", /application\/json/, /catalog_version/],
      ["runs", /text\/csv/, /run_id/],
      ["phases", /text\/csv/, /phase_id/],
      ["dictionary", /application\/json/, /unit_normalizations/],
    ] as const;
    for (const [name, contentType, content] of expectations) {
      const response = await request(exportApp).get(`/api/export/${name}`).expect(200);
      expect(response.headers["content-type"]).toMatch(contentType);
      expect(response.text).toMatch(content);
    }
  });

  it("keeps CORS, security headers, and JSON 404 behavior on nested routes", async () => {
    const response = await request(exportApp).get("/api/export/not-a-real-export").expect(404);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-type"]).toContain("application/json");

    const preflight = await request(exportApp)
      .options("/api/export/manifest")
      .set("Origin", "https://flame-fall-yr9i-teal.vercel.app")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("*");
  });
});
