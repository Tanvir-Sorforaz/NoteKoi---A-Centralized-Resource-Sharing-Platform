import express, { type Application, type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collegeIdOf, hasRole, isClassRepresentative, type AuthRole, type AuthUser } from "../src/lib/authz.js";
import { checkScope, roleCoversScope } from "../src/middleware/checkScope.js";
import { globalErrorHandler } from "../src/middleware/globalErrorHandler.js";
import { notFound } from "../src/middleware/notFound.js";
import { rateLimiter } from "../src/middleware/rateLimiter.js";

// The limiter is skipped when tests set RATE_LIMIT_DISABLED; this file exercises
// the real thing, so it re-enables it for its own module graph.
vi.mock("../src/config/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/index.js")>();

  return { ...actual, config: { ...actual.config, rateLimitDisabled: false } };
});

const role = (overrides: Partial<AuthRole> = {}): AuthRole => ({
  id: "role-1",
  role: "CR",
  scope: "DEPARTMENT_SESSION",
  collegeId: "college-1",
  departmentId: "dept-1",
  sessionId: "session-1",
  expiresAt: null,
  collegeName: null,
  departmentName: null,
  sessionName: null,
  ...overrides,
});

const userWith = (roles: AuthRole[]): AuthUser => ({
  userId: "user-1",
  jti: "jti-1",
  tokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
  name: "Test User",
  email: "test@notekoi.local",
  type: "STUDENT",
  accountStatus: "ACTIVE",
  emailVerifiedAt: new Date(),
  profile: null,
  roles,
});

const buildApp = (handler: RequestHandler, auth?: AuthUser): Application => {
  const app = express();
  app.use(express.json());

  if (auth) {
    app.use((req, _res, next) => {
      req.auth = auth;
      next();
    });
  }

  app.get("/probe/:collegeId/:departmentId/:sessionId", handler, (_req, res) => {
    res.json({ success: true });
  });

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
};

describe("scope helpers (S1-B6)", () => {
  it("lets a PLATFORM_ADMIN role cover every dimension", () => {
    const platformAdmin = role({
      role: "PLATFORM_ADMIN",
      scope: "PLATFORM",
      collegeId: null,
      departmentId: null,
      sessionId: null,
    });

    expect(roleCoversScope(platformAdmin, "COLLEGE", { collegeId: "any" })).toBe(true);
    expect(roleCoversScope(platformAdmin, "DEPARTMENT", { departmentId: "any" })).toBe(true);
    expect(roleCoversScope(platformAdmin, "SESSION", { sessionId: "any" })).toBe(true);
  });

  it("covers the COLLEGE role only inside its own college", () => {
    const subAdmin = role({ role: "SUB_ADMIN", scope: "COLLEGE", departmentId: null, sessionId: null });

    expect(roleCoversScope(subAdmin, "COLLEGE", { collegeId: "college-1" })).toBe(true);
    expect(roleCoversScope(subAdmin, "COLLEGE", { collegeId: "college-2" })).toBe(false);
    expect(roleCoversScope(subAdmin, "COLLEGE", {})).toBe(false);
  });

  it("covers a CR scope only for its own department and session", () => {
    const cr = role();

    expect(roleCoversScope(cr, "DEPARTMENT", { departmentId: "dept-1" })).toBe(true);
    expect(roleCoversScope(cr, "SESSION", { sessionId: "session-1" })).toBe(true);
    expect(roleCoversScope(cr, "SESSION", { sessionId: "session-2" })).toBe(false);
    expect(roleCoversScope(cr, "DEPARTMENT", { departmentId: "dept-2" })).toBe(false);
    expect(roleCoversScope(cr, "COLLEGE", { collegeId: "college-1" })).toBe(false);
  });

  it("knows which roles count as a class representative", () => {
    expect(isClassRepresentative([role()])).toBe(true);
    expect(isClassRepresentative([role({ role: "CO_CR" })])).toBe(true);
    expect(isClassRepresentative([role({ role: "SUB_ADMIN", scope: "COLLEGE" })])).toBe(false);
  });

  it("treats a Platform Admin as passing every role check", () => {
    expect(hasRole([role({ role: "PLATFORM_ADMIN", scope: "PLATFORM" })], "SUB_ADMIN")).toBe(true);
    expect(hasRole([role()], "SUB_ADMIN")).toBe(false);
  });

  it("derives the college from the profile first", () => {
    const withProfile: AuthUser = {
      ...userWith([]),
      profile: {
        kind: "student",
        id: "profile-1",
        collegeId: "college-9",
        departmentId: "dept-1",
        sessionId: "session-1",
        regNo: "R-1",
        includeOtherColleges: false,
        verificationStatus: "ACTIVE",
      },
    };

    expect(collegeIdOf(withProfile)).toBe("college-9");
    expect(collegeIdOf(userWith([role({ role: "SUB_ADMIN", scope: "COLLEGE" })]))).toBe("college-1");
  });
});


describe("checkScope middleware (S1-B6)", () => {
  const handler = checkScope("COLLEGE");

  it("allows a role that covers the college", async () => {
    const app = buildApp(handler, userWith([role({ role: "SUB_ADMIN", scope: "COLLEGE" })]));

    const response = await request(app).get("/probe/college-1/dept-1/session-1");

    expect(response.status).toBe(200);
  });

  it("rejects a role outside the college with 403 FORBIDDEN_SCOPE", async () => {
    const app = buildApp(handler, userWith([role({ role: "SUB_ADMIN", scope: "COLLEGE" })]));

    const response = await request(app).get("/probe/college-2/dept-1/session-1");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN_SCOPE");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const app = buildApp(handler);

    const response = await request(app).get("/probe/college-1/dept-1/session-1");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("lets a Platform Admin into any college", async () => {
    const app = buildApp(handler, userWith([role({ role: "PLATFORM_ADMIN", scope: "PLATFORM" })]));

    const response = await request(app).get("/probe/college-42/dept-9/session-9");

    expect(response.status).toBe(200);
  });

  it("scopes a CR to its own department", async () => {
    const crHandler = checkScope("DEPARTMENT");
    const app = buildApp(crHandler, userWith([role()]));

    expect((await request(app).get("/probe/college-1/dept-1/session-1")).status).toBe(200);

    const outside = await request(app).get("/probe/college-1/dept-2/session-1");

    expect(outside.status).toBe(403);
    expect(outside.body.code).toBe("FORBIDDEN_SCOPE");
  });
});

describe("rateLimiter (S1-B4)", () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.get(
      "/limited",
      rateLimiter({ name: `test-${Date.now()}`, max: 2, windowSeconds: 60 }),
      (_req, res) => {
        res.json({ success: true });
      },
    );
    app.use(globalErrorHandler);
  });

  it("allows requests under the limit and blocks the next one with 429", async () => {
    expect((await request(app).get("/limited")).status).toBe(200);
    expect((await request(app).get("/limited")).status).toBe(200);

    const blocked = await request(app).get("/limited");

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });
});
