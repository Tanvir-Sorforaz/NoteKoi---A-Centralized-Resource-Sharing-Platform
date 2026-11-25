export type UserType = "STUDENT" | "TEACHER" | "PLATFORM_ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type ProfileVerificationStatus = "PENDING_VERIFICATION" | "ACTIVE" | "REJECTED";
export type UserRoleType = "CR" | "CO_CR" | "SUB_ADMIN" | "PLATFORM_ADMIN";
export type RoleScope = "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";

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

/** `GET /api/v1/auth/me` (S1-B10). */
export interface Me {
  id: string;
  name: string;
  email: string;
  type: UserType;
  accountStatus: AccountStatus;
  emailVerifiedAt: string | null;
  profile: StudentProfileView | TeacherProfileView | null;
  roles: PublicRole[];
}

export interface LoginResult {
  user: Me;
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
  expiresInSeconds: number;
}

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

export interface RegisterResult {
  userId: string;
  email: string;
  type: UserType;
  verificationEmailSent: boolean;
}

export interface MessageResult {
  message: string;
  retryAfterSeconds?: number;
}
