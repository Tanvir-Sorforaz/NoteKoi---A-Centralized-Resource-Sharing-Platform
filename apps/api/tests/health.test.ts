import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { closeRedis } from "../src/lib/redis.js";

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL?.trim());

describe.skipIf(!hasTestDatabase)("GET /health", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await closeRedis();
  });

  it("reports PostgreSQL and Redis as ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { database: "ok", redis: "ok" },
    });
  });
});
