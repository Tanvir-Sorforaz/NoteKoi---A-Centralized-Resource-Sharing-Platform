import express, { type Application } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { globalErrorHandler } from "../src/middleware/globalErrorHandler.js";
import { notFound } from "../src/middleware/notFound.js";
import { AppError } from "../src/utils/AppError.js";
import { sendResponse } from "../src/utils/sendResponse.js";

const buildApp = (): Application => {
  const app = express();
  app.use(express.json());

  app.get("/ok", (_req, res) => {
    sendResponse(res, { message: "fine", data: { id: 1 } });
  });

  app.get("/app-error", () => {
    throw new AppError(409, "Already exists", "DUPLICATE");
  });

  app.get("/zod-error", () => {
    z.object({ name: z.string() }).parse({ name: 42 });
  });

  app.get("/prisma-error", () => {
    throw Object.assign(new Error("unique violation"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["email"] },
    });
  });

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
};

describe("response helpers and error handler", () => {
  const app = buildApp();

  it("wraps success bodies in { success, message, data, meta }", async () => {
    const response = await request(app).get("/ok");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "fine",
      data: { id: 1 },
      meta: {},
    });
  });

  it("renders AppError with its status and code", async () => {
    const response = await request(app).get("/app-error");

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      message: "Already exists",
      code: "DUPLICATE",
      errors: [],
    });
  });

  it("maps ZodError to a 400 VALIDATION_ERROR with field paths", async () => {
    const response = await request(app).get("/zod-error");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.errors[0].path).toBe("name");
  });

  it("maps Prisma P2002 to a 409 DUPLICATE", async () => {
    const response = await request(app).get("/prisma-error");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("DUPLICATE");
  });

  it("answers unknown routes with a 404 ROUTE_NOT_FOUND", async () => {
    const response = await request(app).get("/nope");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, code: "ROUTE_NOT_FOUND" });
  });

  it("rejects malformed JSON bodies with 400 INVALID_JSON", async () => {
    const response = await request(app)
      .post("/ok")
      .set("Content-Type", "application/json")
      .send("{not-json");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_JSON");
  });

  it("keeps AppError subclasses distinguishable", () => {
    const error = AppError.forbidden("Nope", "WRONG_ROLE");

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(403);
    expect(error.isOperational).toBe(true);
  });
});
