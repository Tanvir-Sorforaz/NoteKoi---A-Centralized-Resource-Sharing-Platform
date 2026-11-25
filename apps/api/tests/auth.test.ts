import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * S1-B15 — auth integration tests against TEST_DATABASE_URL (+ Redis).
 * The mailer is mocked so the test can read the OTP the user would receive.
 */
const mailBox = vi.hoisted(() => ({
  sent: [] as { to: string; name: string; code: string; purpose: string }[],
}));

vi.mock("../src/lib/mailer.js", () => ({
  sendOtpEmail: async (input: { to: string; name: string; code: string; purpose: string }) => {
    mailBox.sent.push(input);
  },
}));

const lastCodeFor = (to: string): string => {
  const mail = [...mailBox.sent].reverse().find((entry) => entry.to === to);

  if (!mail) throw new Error(`No email was captured for ${to}`);

  return mail.code;
};

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
const PASSWORD = "Pass1234!";
const NEW_PASSWORD = "NewPass5678!";

interface Fixtures {
  collegeId: string;
  departmentId: string;
  sessionId: string;
  otherCollegeId: string;
  otherDepartmentId: string;
}

let fixtures: Fixtures;

const api = () => request(app);

const studentPayload = (overrides: Record<string, unknown> = {}) => ({
  role: "STUDENT",
  name: "Alice Student",
  email: `student-${runId}@test.local`,
  password: PASSWORD,
  collegeId: fixtures.collegeId,
  departmentId: fixtures.departmentId,
  sessionId: fixtures.sessionId,
  regNo: `REG-${runId}`,
  ...overrides,
});

const teacherPayload = (overrides: Record<string, unknown> = {}) => ({
  role: "TEACHER",
  name: "Prof Karim",
  email: `teacher-${runId}@test.local`,
  password: PASSWORD,
  collegeId: fixtures.collegeId,
  departmentIds: [fixtures.departmentId],
  ...overrides,
});

const registerUser = async (payload: Record<string, unknown>): Promise<string> => {
  const response = await api().post("/api/v1/auth/register").send(payload);

  expect(response.status).toBe(201);

  return String(response.body.data.userId);
};

const verifyEmailOf = async (email: string): Promise<void> => {
  const response = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

  expect(response.status).toBe(200);
};

const loginAs = async (email: string, password = PASSWORD) => api().post("/api/v1/auth/login").send({ email, password });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Test College ${runId}` } });
  const otherCollege = await prisma.college.create({ data: { name: `Other College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Computer Science ${runId}` } });
  const otherDepartment = await prisma.department.create({ data: { name: `Electrical ${runId}` } });

  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });
  await prisma.collegeDepartment.create({
    data: { collegeId: otherCollege.id, departmentId: otherDepartment.id },
  });

  const session = await prisma.session.create({
    data: { departmentId: department.id, name: `Session ${runId}` },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    otherCollegeId: otherCollege.id,
    otherDepartmentId: otherDepartment.id,
  };
});

describeWithDatabase("auth: register", () => {
  it("creates a student with an explicit type and a pending profile", async () => {
    const response = await api().post("/api/v1/auth/register").send(studentPayload());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      email: `student-${runId}@test.local`,
      type: "STUDENT",
      verificationEmailSent: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: `student-${runId}@test.local` },
      select: {
        type: true,
        emailVerifiedAt: true,
        accountStatus: true,
        studentProfile: { select: { verificationStatus: true, regNo: true } },
        teacherProfile: { select: { id: true } },
      },
    });

    expect(user.type).toBe("STUDENT");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.accountStatus).toBe("ACTIVE");
    expect(user.studentProfile?.verificationStatus).toBe("PENDING_VERIFICATION");
    expect(user.teacherProfile).toBeNull();
    expect(lastCodeFor(`student-${runId}@test.local`)).toMatch(/^\d{6}$/);
  });

  it("creates a teacher with TeacherDepartment rows and no student profile", async () => {
    const email = `teacher-${runId}@test.local`;
    const response = await api().post("/api/v1/auth/register").send(teacherPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe("TEACHER");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        type: true,
        studentProfile: { select: { id: true } },
        teacherProfile: {
          select: { collegeId: true, teacherDepartments: { select: { departmentId: true } } },
        },
      },
    });

    expect(user.type).toBe("TEACHER");
    expect(user.studentProfile).toBeNull();
    expect(user.teacherProfile?.collegeId).toBe(fixtures.collegeId);
    expect(user.teacherProfile?.teacherDepartments.map((row) => row.departmentId)).toEqual([
      fixtures.departmentId,
    ]);
  });

  it("rejects a duplicate email with 409 EMAIL_TAKEN", async () => {
    const response = await api().post("/api/v1/auth/register").send(studentPayload({ regNo: `REG-dup-${runId}` }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input with 400 VALIDATION_ERROR", async () => {
    const response = await api()
      .post("/api/v1/auth/register")
      .send(studentPayload({ email: "not-an-email", password: "short", regNo: "X-1" }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");

    const paths = (response.body.errors as { path: string }[]).map((issue) => issue.path);
    expect(paths).toContain("email");
    expect(paths).toContain("password");
  });

  it("rejects a department the college has not adopted", async () => {
    const response = await api()
      .post("/api/v1/auth/register")
      .send(
        studentPayload({
          email: `bad-dept-${runId}@test.local`,
          departmentId: fixtures.otherDepartmentId,
          sessionId: fixtures.sessionId,
          regNo: `REG-bad-dept-${runId}`,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_DEPARTMENT");
  });

  it("rejects a session that belongs to another department", async () => {
    const otherSession = await prisma.session.create({
      data: { departmentId: fixtures.otherDepartmentId, name: `Other session ${runId}` },
    });

    const response = await api()
      .post("/api/v1/auth/register")
      .send(
        studentPayload({
          email: `bad-session-${runId}@test.local`,
          sessionId: otherSession.id,
          regNo: `REG-bad-session-${runId}`,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_SESSION");
  });

  it("rejects a registration number already used in the college", async () => {
    const response = await api()
      .post("/api/v1/auth/register")
      .send(studentPayload({ email: `dup-regno-${runId}@test.local` }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("REG_NO_TAKEN");
  });

  it("rejects a teacher department the college has not adopted", async () => {
    const response = await api()
      .post("/api/v1/auth/register")
      .send(
        teacherPayload({
          email: `bad-teacher-${runId}@test.local`,
          departmentIds: [fixtures.departmentId, fixtures.otherDepartmentId],
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_DEPARTMENT");
  });
});

describeWithDatabase("auth: email verification", () => {
  const email = `verify-${runId}@test.local`;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) return;

    await registerUser(studentPayload({ email, regNo: `REG-verify-${runId}` }));
  });

  it("rejects a wrong code", async () => {
    const response = await api().post("/api/v1/auth/verify-email").send({ email, code: "000000" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_OTP");
  });

  it("answers unknown emails with 400 OTP_EXPIRED", async () => {
    const response = await api()
      .post("/api/v1/auth/verify-email")
      .send({ email: `nobody-${runId}@test.local`, code: "123456" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("OTP_EXPIRED");
  });

  it("enforces the 60 s resend cooldown", async () => {
    const response = await api().post("/api/v1/auth/resend-verification").send({ email });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("OTP_COOLDOWN");
  });

  it("verifies the email with the emailed code", async () => {
    const response = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

    expect(response.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { emailVerifiedAt: true },
    });

    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("refuses to verify twice", async () => {
    const response = await api().post("/api/v1/auth/verify-email").send({ email, code: "123456" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("EMAIL_ALREADY_VERIFIED");
  });
});

describeWithDatabase("auth: login, me and logout", () => {
  const email = `verify-${runId}@test.local`;
  const unverifiedEmail = `unverified-${runId}@test.local`;
  let accessToken = "";
  let authCookie = "";

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) return;

    await registerUser(studentPayload({ email: unverifiedEmail, regNo: `REG-unverified-${runId}` }));
  });

  it("rejects an unknown email with 401 INVALID_CREDENTIALS", async () => {
    const response = await loginAs(`missing-${runId}@test.local`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a wrong password with 401 INVALID_CREDENTIALS", async () => {
    const response = await loginAs(email, "WrongPass123");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("blocks an unverified email with 403 EMAIL_NOT_VERIFIED", async () => {
    const response = await loginAs(unverifiedEmail);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("signs in with the cookie and returns the token", async () => {
    const response = await loginAs(email);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ email, type: "STUDENT" });
    expect(response.body.data.user.profile.verificationStatus).toBe("PENDING_VERIFICATION");
    expect(response.body.data.tokenType).toBe("Bearer");

    const cookies = response.headers["set-cookie"] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith("accessToken="));

    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");

    accessToken = response.body.data.token as string;
    authCookie = (cookie as string).split(";")[0] as string;
  });

  it("returns the current user for GET /me (Bearer)", async () => {
    const response = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      email,
      type: "STUDENT",
      accountStatus: "ACTIVE",
      profile: { kind: "student", verificationStatus: "PENDING_VERIFICATION" },
    });
    expect(Array.isArray(response.body.data.roles)).toBe(true);
  });

  it("returns the current user for GET /me (cookie)", async () => {
    const response = await api().get("/api/v1/auth/me").set("Cookie", authCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(email);
  });

  it("rejects a missing token with 401 NOT_AUTHENTICATED", async () => {
    const response = await api().get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("rejects a malformed token with 401 INVALID_TOKEN", async () => {
    const response = await api().get("/api/v1/auth/me").set("Authorization", "Bearer not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_TOKEN");
  });

  it("blocks a suspended account at login", async () => {
    await prisma.user.update({ where: { email }, data: { accountStatus: "SUSPENDED" } });

    const response = await loginAs(email);

    await prisma.user.update({ where: { email }, data: { accountStatus: "ACTIVE" } });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ACCOUNT_SUSPENDED");
  });

  it("revokes the token on logout", async () => {
    const logoutResponse = await api()
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logoutResponse.status).toBe(200);

    const meResponse = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(meResponse.status).toBe(401);
    expect(meResponse.body.code).toBe("TOKEN_REVOKED");
  });
});

describeWithDatabase("auth: password reset", () => {
  const email = `verify-${runId}@test.local`;

  it("answers an unknown address with the neutral message", async () => {
    const response = await api()
      .post("/api/v1/auth/forgot-password")
      .send({ email: `nobody-${runId}@test.local` });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account exists/i);
  });

  it("sends a reset code to a verified account", async () => {
    const response = await api().post("/api/v1/auth/forgot-password").send({ email });

    expect(response.status).toBe(200);
    expect(lastCodeFor(email)).toMatch(/^\d{6}$/);
  });

  it("rejects a wrong reset code", async () => {
    const response = await api()
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "000000", newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_OTP");
  });

  it("sets the new password and rejects the old one", async () => {
    const resetResponse = await api()
      .post("/api/v1/auth/reset-password")
      .send({ email, code: lastCodeFor(email), newPassword: NEW_PASSWORD });

    expect(resetResponse.status).toBe(200);

    const oldPasswordLogin = await loginAs(email, PASSWORD);
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await loginAs(email, NEW_PASSWORD);
    expect(newPasswordLogin.status).toBe(200);
  });

  it("validates the new password policy", async () => {
    const response = await api()
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "123456", newPassword: "short" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describeWithDatabase("public lookups for the register form", () => {
  it("lists active colleges", async () => {
    const response = await api().get("/api/v1/colleges");

    expect(response.status).toBe(200);
    expect(response.body.data.some((college: { id: string }) => college.id === fixtures.collegeId)).toBe(true);
  });

  it("lists the departments a college has adopted", async () => {
    const response = await api().get(`/api/v1/colleges/${fixtures.collegeId}/departments`);

    expect(response.status).toBe(200);
    expect(response.body.data.college.id).toBe(fixtures.collegeId);
    expect(response.body.data.departments.map((row: { id: string }) => row.id)).toContain(
      fixtures.departmentId,
    );
  });

  it("lists the sessions of a department", async () => {
    const response = await api().get(`/api/v1/departments/${fixtures.departmentId}/sessions`);

    expect(response.status).toBe(200);
    expect(response.body.data.sessions.map((row: { id: string }) => row.id)).toContain(fixtures.sessionId);
  });

  it("rejects a malformed college id with 400 VALIDATION_ERROR", async () => {
    const response = await api().get("/api/v1/colleges/not-a-uuid/departments");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("answers an unknown department with 404 DEPARTMENT_NOT_FOUND", async () => {
    const response = await api().get("/api/v1/departments/00000000-0000-4000-8000-000000000000/sessions");

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("DEPARTMENT_NOT_FOUND");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});





