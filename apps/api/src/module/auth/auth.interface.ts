import type {
  AccountStatus,
  ProfileVerificationStatus,
  RoleScope,
  UserRoleType,
  UserType,
} from "../../../generated/prisma/enums.js";

// ---------------------------------------------------------------------------
// Request payloads (the zod schemas in auth.validation.ts produce these)
// ---------------------------------------------------------------------------

export interface RegisterStudentInput {
  role: "STUDENT";
  name: string;
  email: string;
  password: string;
  collegeId: string;
  departmentId: string;
  sessionId: string;
  regNo: string;
}

export interface RegisterTeacherInput {
  role: "TEACHER";
  name: string;
  email: string;
  password: string;
  collegeId: string;
  departmentIds: string[];
}

export type RegisterInput = RegisterStudentInput | RegisterTeacherInput;

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyEmailInput {
  email: string;
  code: string;
}

export interface ResendVerificationInput {
  email: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface EntityRef {
  id: string;
  name: string;
}

export interface PublicRole {
  id: string;
  role: UserRoleType;
  scope: RoleScope;
  college: EntityRef | null;
  department: EntityRef | null;
  session: EntityRef | null;
  expiresAt: string | null;
}

export interface StudentProfileView {
  kind: "student";
  id: string;
  college: EntityRef;
  department: EntityRef;
  session: EntityRef;
  regNo: string;
  includeOtherColleges: boolean;
  verificationStatus: ProfileVerificationStatus;
  rejectedReason: string | null;
}

export interface TeacherProfileView {
  kind: "teacher";
  id: string;
  college: EntityRef;
  departments: EntityRef[];
  verificationStatus: ProfileVerificationStatus;
  rejectedReason: string | null;
}

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  type: UserType;
  accountStatus: AccountStatus;
  emailVerifiedAt: string | null;
  profile: StudentProfileView | TeacherProfileView | null;
  roles: PublicRole[];
}

export interface LoginResponse {
  user: MeResponse;
  token: string;
  tokenType: "Bearer";
  /** ISO timestamp of the token expiry. */
  expiresAt: string;
  /** Seconds the cookie/token stays valid. */
  expiresInSeconds: number;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  type: UserType;
  /** False only when the OTP email could not be produced (Redis/SMTP down). */
  verificationEmailSent: boolean;
}

export interface SimpleMessageResponse {
  message: string;
}
