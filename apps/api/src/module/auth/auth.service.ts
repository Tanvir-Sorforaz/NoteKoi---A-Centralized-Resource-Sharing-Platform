import { getActiveRoles, type AuthUser } from "../../lib/authz.js";
import { hashPassword, verifyPassword } from "../../lib/hash.js";
import { denyAccessToken, signAccessToken } from "../../lib/jwt.js";
import { sendOtpEmail } from "../../lib/mailer.js";
import { OTP_RESEND_COOLDOWN_SECONDS, clearOtp, issueOtp, secondsUntilResend, verifyOtp } from "../../lib/otp.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  LoginResponse,
  MeResponse,
  PublicRole,
  RegisterInput,
  RegisterResponse,
  ResendVerificationInput,
  ResetPasswordInput,
  SimpleMessageResponse,
  TeacherProfileView,
  VerifyEmailInput,
} from "./auth.interface.js";

/** Used to keep "unknown email" and "wrong password" equally slow. */
const dummyHash = hashPassword("notekoi-timing-guard-value");

const invalidCredentials = (): AppError =>
  AppError.unauthorized("Incorrect email or password", "INVALID_CREDENTIALS");

/** Emails are best-effort after the DB commit: the user can always resend. */
const trySendOtp = async (input: {
  to: string;
  name: string;
  code: string;
  purpose: "verify-email" | "reset-password";
}): Promise<boolean> => {
  try {
    await sendOtpEmail(input);
    return true;
  } catch (error) {
    console.error(`[auth] could not send the ${input.purpose} email to ${input.to}: ${(error as Error).message}`);
    return false;
  }
};

const ensureCollege = async (collegeId: string): Promise<void> => {
  const college = await prisma.college.findFirst({
    where: { id: collegeId, isActive: true },
    select: { id: true },
  });

  if (!college) {
    throw AppError.badRequest("Select an active college", "INVALID_COLLEGE");
  }
};

const ensureAdoptedDepartment = async (collegeId: string, departmentId: string): Promise<void> => {
  const link = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId, departmentId } },
    select: { department: { select: { isActive: true } } },
  });

  if (!link || !link.department.isActive) {
    throw AppError.badRequest("The selected department is not offered by this college", "INVALID_DEPARTMENT");
  }
};


/**
 * S1-B8 — registers a student or a teacher in ONE transaction:
 * `User` (type set explicitly) + exactly one profile (+ `TeacherDepartment` rows).
 */
export const register = async (input: RegisterInput): Promise<RegisterResponse> => {
  const emailTaken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });

  if (emailTaken) {
    throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
  }

  await ensureCollege(input.collegeId);

  if (input.role === "STUDENT") {
    await ensureAdoptedDepartment(input.collegeId, input.departmentId);

    const session = await prisma.session.findFirst({
      where: { id: input.sessionId, departmentId: input.departmentId, isActive: true },
      select: { id: true },
    });

    if (!session) {
      throw AppError.badRequest("Select an active session of the chosen department", "INVALID_SESSION");
    }

    const regNoTaken = await prisma.studentProfile.findUnique({
      where: { unique_student_reg_no_per_college: { collegeId: input.collegeId, regNo: input.regNo } },
      select: { id: true },
    });

    if (regNoTaken) {
      throw AppError.conflict("This registration number is already registered in your college", "REG_NO_TAKEN");
    }
  } else {
    for (const departmentId of input.departmentIds) {
      await ensureAdoptedDepartment(input.collegeId, departmentId);
    }
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        // Never rely on the schema default for the account type.
        type: input.role === "STUDENT" ? "STUDENT" : "TEACHER",
      },
      select: { id: true, type: true },
    });

    if (input.role === "STUDENT") {
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          collegeId: input.collegeId,
          departmentId: input.departmentId,
          sessionId: input.sessionId,
          regNo: input.regNo,
        },
      });
    } else {
      await tx.teacherProfile.create({
        data: {
          userId: created.id,
          collegeId: input.collegeId,
          teacherDepartments: {
            create: input.departmentIds.map((departmentId) => ({ departmentId })),
          },
        },
      });
    }

    return created;
  });

  let verificationEmailSent = false;

  try {
    const code = await issueOtp("verify-email", user.id);
    verificationEmailSent = await trySendOtp({ to: input.email, name: input.name, code, purpose: "verify-email" });
  } catch (error) {
    console.error(`[auth] could not issue a verification code for ${input.email}: ${(error as Error).message}`);
  }

  return { userId: user.id, email: input.email, type: user.type, verificationEmailSent };
};

/** S1-B9 — consumes the emailed code and flips `emailVerifiedAt`. */
export const verifyEmail = async (input: VerifyEmailInput): Promise<SimpleMessageResponse> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, emailVerifiedAt: true },
  });

  if (!user) {
    throw new AppError(400, "This code is invalid or has expired. Request a new one.", "OTP_EXPIRED");
  }

  if (user.emailVerifiedAt) {
    throw AppError.conflict("Your email is already verified. You can sign in.", "EMAIL_ALREADY_VERIFIED");
  }

  await verifyOtp("verify-email", user.id, input.code);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  return { message: "Email verified. You can sign in now." };
};

/** S1-B9 — new code after the 60 s cooldown. Unknown emails get a neutral answer. */
export const resendVerification = async (
  input: ResendVerificationInput,
): Promise<SimpleMessageResponse & { retryAfterSeconds: number }> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, emailVerifiedAt: true, accountStatus: true },
  });

  if (!user || user.accountStatus === "SUSPENDED") {
    return { message: "If an account needs verification, a new code has been sent.", retryAfterSeconds: 0 };
  }

  if (user.emailVerifiedAt) {
    throw AppError.conflict("Your email is already verified. You can sign in.", "EMAIL_ALREADY_VERIFIED");
  }

  const waitSeconds = await secondsUntilResend("verify-email", user.id);

  if (waitSeconds > 0) {
    throw new AppError(429, `Please wait ${waitSeconds} seconds before requesting another code`, "OTP_COOLDOWN", [
      { retryAfterSeconds: waitSeconds },
    ]);
  }

  const code = await issueOtp("verify-email", user.id);
  await trySendOtp({ to: input.email, name: user.name, code, purpose: "verify-email" });

  return {
    message: "A new verification code has been sent.",
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
};

/** S1-B10 — credentials → access token (the controller also sets the httpOnly cookie). */
export const login = async (input: LoginInput): Promise<LoginResponse> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, accountStatus: true, emailVerifiedAt: true },
  });

  if (!user) {
    await verifyPassword(input.password, await dummyHash);
    throw invalidCredentials();
  }

  if (user.accountStatus === "SUSPENDED") {
    throw AppError.forbidden("Your account is suspended. Contact your college Sub Admin.", "ACCOUNT_SUSPENDED");
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (!user.emailVerifiedAt) {
    throw AppError.forbidden("Verify your email address before signing in", "EMAIL_NOT_VERIFIED");
  }

  const signed = signAccessToken(user.id);
  const me = await buildMe(user.id);

  return {
    user: me,
    token: signed.token,
    tokenType: "Bearer",
    expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
    expiresInSeconds: signed.ttlSeconds,
  };
};

/** S1-B10 — revokes the presented token for its remaining lifetime (D8). */
export const logout = async (auth: AuthUser): Promise<SimpleMessageResponse> => {
  const remainingSeconds = auth.tokenExpiresAt - Math.floor(Date.now() / 1000);

  await denyAccessToken(auth.jti, remainingSeconds);

  return { message: "Signed out." };
};

/** S1-B11 — always the same answer, so the endpoint cannot be used to enumerate accounts. */
const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, a password reset code has been sent.";

export const forgotPassword = async (input: ForgotPasswordInput): Promise<SimpleMessageResponse> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, emailVerifiedAt: true, accountStatus: true },
  });

  if (!user || user.accountStatus === "SUSPENDED" || !user.emailVerifiedAt) {
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  try {
    const code = await issueOtp("reset-password", user.id);
    await trySendOtp({ to: input.email, name: user.name, code, purpose: "reset-password" });
  } catch (error) {
    // A cooldown must not reveal that the address exists.
    if (!(error instanceof AppError) || error.code !== "OTP_COOLDOWN") throw error;
  }

  return { message: FORGOT_PASSWORD_MESSAGE };
};

/** S1-B11 — code + new password. The code is destroyed on success. */
export const resetPassword = async (input: ResetPasswordInput): Promise<SimpleMessageResponse> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (!user) {
    throw new AppError(400, "This code is invalid or has expired. Request a new one.", "OTP_EXPIRED");
  }

  await verifyOtp("reset-password", user.id, input.code);

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await clearOtp("reset-password", user.id);

  return { message: "Password updated. Sign in with your new password." };
};

const toPublicRole = (role: Awaited<ReturnType<typeof getActiveRoles>>[number]): PublicRole => ({
  id: role.id,
  role: role.role,
  scope: role.scope,
  college: role.collegeId ? { id: role.collegeId, name: role.collegeName ?? "" } : null,
  department: role.departmentId ? { id: role.departmentId, name: role.departmentName ?? "" } : null,
  session: role.sessionId ? { id: role.sessionId, name: role.sessionName ?? "" } : null,
  expiresAt: role.expiresAt ? role.expiresAt.toISOString() : null,
});

/** S1-B10 — everything the frontend needs to render menus and guards. */
export const buildMe = async (userId: string): Promise<MeResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      type: true,
      accountStatus: true,
      emailVerifiedAt: true,
      studentProfile: {
        select: {
          id: true,
          regNo: true,
          includeOtherColleges: true,
          verificationStatus: true,
          rejectedReason: true,
          college: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          session: { select: { id: true, name: true } },
        },
      },
      teacherProfile: {
        select: {
          id: true,
          verificationStatus: true,
          rejectedReason: true,
          college: { select: { id: true, name: true } },
          teacherDepartments: { select: { department: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!user) {
    throw AppError.unauthorized("This account no longer exists", "ACCOUNT_NOT_FOUND");
  }

  const roles = (await getActiveRoles(user.id)).map(toPublicRole);

  let profile: MeResponse["profile"] = null;

  if (user.studentProfile) {
    const student = user.studentProfile;

    profile = {
      kind: "student",
      id: student.id,
      college: student.college,
      department: student.department,
      session: student.session,
      regNo: student.regNo,
      includeOtherColleges: student.includeOtherColleges,
      verificationStatus: student.verificationStatus,
      rejectedReason: student.rejectedReason,
    };
  } else if (user.teacherProfile) {
    const teacher = user.teacherProfile;

    const teacherView: TeacherProfileView = {
      kind: "teacher",
      id: teacher.id,
      college: teacher.college,
      departments: teacher.teacherDepartments.map((row) => row.department),
      verificationStatus: teacher.verificationStatus,
      rejectedReason: teacher.rejectedReason,
    };

    profile = teacherView;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    profile,
    roles,
  };
};


