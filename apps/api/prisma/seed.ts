/**
 * S1-B14 — development seed.
 *
 * Creates the platform admin, one college + department + session + course, and
 * one ACTIVE demo account per role (student, CR, teacher, Sub Admin).
 * Idempotent: run it as often as you like (`npm run db:seed`).
 *
 * All demo accounts share `SEED_PASSWORD` from apps/api/.env.
 */
import { config } from "../src/config/index.js";
import { hashPassword } from "../src/lib/hash.js";
import { prisma } from "../src/lib/prisma.js";

if (config.isProduction) {
  throw new Error("prisma/seed.ts is a development seed and refuses to run with NODE_ENV=production");
}

const seedPassword = config.seedPassword;

if (!seedPassword) {
  throw new Error("SEED_PASSWORD is missing. Add it to apps/api/.env (see .env.example).");
}

const DEMO = {
  college: "NoteKoi Demo College",
  department: "Computer Science",
  session: "Session 2024-2025",
  course: "Data Structures",
} as const;

const ACCOUNTS = {
  admin: "admin@notekoi.local",
  student: "student@notekoi.local",
  cr: "cr@notekoi.local",
  teacher: "teacher@notekoi.local",
  subAdmin: "subadmin@notekoi.local",
} as const;

const main = async (): Promise<void> => {
  const passwordHash = await hashPassword(seedPassword);
  const verifiedAt = new Date();

  const college = await prisma.college.upsert({
    where: { name: DEMO.college },
    update: { isActive: true },
    create: { name: DEMO.college },
    select: { id: true, name: true },
  });

  const department = await prisma.department.upsert({
    where: { name: DEMO.department },
    update: { isActive: true },
    create: { name: DEMO.department },
    select: { id: true, name: true },
  });

  await prisma.collegeDepartment.upsert({
    where: { unique_college_department: { collegeId: college.id, departmentId: department.id } },
    update: {},
    create: { collegeId: college.id, departmentId: department.id },
  });

  const session = await prisma.session.upsert({
    where: { unique_session_department_name: { departmentId: department.id, name: DEMO.session } },
    update: { isActive: true },
    create: {
      departmentId: department.id,
      name: DEMO.session,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-08-31"),
    },
    select: { id: true, name: true },
  });

  const course = await prisma.course.upsert({
    where: { unique_course_department_name: { departmentId: department.id, name: DEMO.course } },
    update: { isActive: true },
    create: { departmentId: department.id, name: DEMO.course, semester: 3 },
    select: { id: true, name: true },
  });

  const upsertUser = async (input: {
    email: string;
    name: string;
    type: "STUDENT" | "TEACHER" | "PLATFORM_ADMIN";
  }) =>
    prisma.user.upsert({
      where: { email: input.email },
      update: {
        name: input.name,
        passwordHash,
        type: input.type,
        accountStatus: "ACTIVE",
        emailVerifiedAt: verifiedAt,
      },
      create: {
        email: input.email,
        name: input.name,
        passwordHash,
        type: input.type,
        accountStatus: "ACTIVE",
        emailVerifiedAt: verifiedAt,
      },
      select: { id: true, email: true, type: true },
    });

  await prisma.$transaction(async (tx) => {
    // Platform Admin: no profile, one PLATFORM_ADMIN role.
    const admin = await tx.user.upsert({
      where: { email: ACCOUNTS.admin },
      update: { name: "Platform Admin", passwordHash, type: "PLATFORM_ADMIN", emailVerifiedAt: verifiedAt },
      create: {
        email: ACCOUNTS.admin,
        name: "Platform Admin",
        passwordHash,
        type: "PLATFORM_ADMIN",
        emailVerifiedAt: verifiedAt,
      },
      select: { id: true },
    });

    const existingAdminRole = await tx.userRole.findFirst({
      where: { userId: admin.id, role: "PLATFORM_ADMIN", revokedAt: null },
      select: { id: true },
    });

    if (!existingAdminRole) {
      await tx.userRole.create({
        data: { userId: admin.id, role: "PLATFORM_ADMIN", scope: "PLATFORM" },
      });
    }
  });

  const studentUser = await upsertUser({ email: ACCOUNTS.student, name: "Demo Student", type: "STUDENT" });

  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1001",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    create: {
      userId: studentUser.id,
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1001",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
  });

  const ensureRole = async (input: {
    userId: string;
    role: "CR" | "CO_CR" | "SUB_ADMIN" | "PLATFORM_ADMIN";
    scope: "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";
    collegeId?: string;
    departmentId?: string;
    sessionId?: string;
  }): Promise<void> => {
    const existing = await prisma.userRole.findFirst({
      where: { userId: input.userId, role: input.role, revokedAt: null },
      select: { id: true },
    });

    if (!existing) {
      await prisma.userRole.create({
        data: {
          userId: input.userId,
          role: input.role,
          scope: input.scope,
          collegeId: input.collegeId ?? null,
          departmentId: input.departmentId ?? null,
          sessionId: input.sessionId ?? null,
        },
      });
    }
  };

  // CR: a student of the demo batch with an active CR role.
  const crUser = await upsertUser({ email: ACCOUNTS.cr, name: "Demo CR", type: "STUDENT" });

  await prisma.studentProfile.upsert({
    where: { userId: crUser.id },
    update: {
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1002",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    create: {
      userId: crUser.id,
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1002",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
  });

  await ensureRole({
    userId: crUser.id,
    role: "CR",
    scope: "DEPARTMENT_SESSION",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
  });

  // Teacher: verified, belongs to one adopted department.
  const teacherUser = await upsertUser({ email: ACCOUNTS.teacher, name: "Demo Teacher", type: "TEACHER" });

  const teacherProfile = await prisma.teacherProfile.upsert({
    where: { userId: teacherUser.id },
    update: { collegeId: college.id, verificationStatus: "ACTIVE", verifiedAt },
    create: {
      userId: teacherUser.id,
      collegeId: college.id,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    select: { id: true },
  });

  await prisma.teacherDepartment.upsert({
    where: { unique_teacher_department: { teacherProfileId: teacherProfile.id, departmentId: department.id } },
    update: {},
    create: { teacherProfileId: teacherProfile.id, departmentId: department.id },
  });

  // Sub Admin: a teacher of the college with the college-scoped role.
  const subAdminUser = await upsertUser({ email: ACCOUNTS.subAdmin, name: "Demo Sub Admin", type: "TEACHER" });

  const subAdminProfile = await prisma.teacherProfile.upsert({
    where: { userId: subAdminUser.id },
    update: { collegeId: college.id, verificationStatus: "ACTIVE", verifiedAt },
    create: {
      userId: subAdminUser.id,
      collegeId: college.id,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    select: { id: true },
  });

  await prisma.teacherDepartment.upsert({
    where: {
      unique_teacher_department: { teacherProfileId: subAdminProfile.id, departmentId: department.id },
    },
    update: {},
    create: { teacherProfileId: subAdminProfile.id, departmentId: department.id },
  });

  await ensureRole({
    userId: subAdminUser.id,
    role: "SUB_ADMIN",
    scope: "COLLEGE",
    collegeId: college.id,
  });

  console.log(
    [
      "",
      "✔ Seed complete (development only)",
      `  college:    ${college.name}`,
      `  department: ${department.name}`,
      `  session:    ${session.name}`,
      `  course:     ${course.name}`,
      "",
      "  demo accounts (same password: SEED_PASSWORD in apps/api/.env):",
      `    platform admin  ${ACCOUNTS.admin}`,
      `    student         ${ACCOUNTS.student}`,
      `    CR              ${ACCOUNTS.cr}`,
      `    teacher         ${ACCOUNTS.teacher}`,
      `    sub admin       ${ACCOUNTS.subAdmin}`,
      "",
    ].join("\n"),
  );
};

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

