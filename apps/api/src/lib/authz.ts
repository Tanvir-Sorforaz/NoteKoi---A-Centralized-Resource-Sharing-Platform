import type {
  AccountStatus,
  ProfileVerificationStatus,
  RoleScope,
  UserRoleType,
  UserType,
} from "../../generated/prisma/enums.js";
import { prisma } from "./prisma.js";

/** One active (not revoked, not expired) `UserRole` row. */
export interface AuthRole {
  id: string;
  role: UserRoleType;
  scope: RoleScope;
  collegeId: string | null;
  departmentId: string | null;
  sessionId: string | null;
  expiresAt: Date | null;
  collegeName: string | null;
  departmentName: string | null;
  sessionName: string | null;
}

export type AuthProfile =
  | {
      kind: "student";
      id: string;
      collegeId: string;
      departmentId: string;
      sessionId: string;
      regNo: string;
      includeOtherColleges: boolean;
      verificationStatus: ProfileVerificationStatus;
    }
  | {
      kind: "teacher";
      id: string;
      collegeId: string;
      departmentIds: string[];
      verificationStatus: ProfileVerificationStatus;
    };

/** What `checkAuth` attaches to `req.auth`. */
export interface AuthUser {
  userId: string;
  jti: string;
  /** Unix seconds. */
  tokenExpiresAt: number;
  name: string;
  email: string;
  type: UserType;
  accountStatus: AccountStatus;
  emailVerifiedAt: Date | null;
  profile: AuthProfile | null;
  roles: AuthRole[];
}

/** Active role = not revoked and (no expiry or expiry in the future). */
export const activeRoleWhere = (userId: string) => ({
  userId,
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

export const getActiveRoles = async (userId: string): Promise<AuthRole[]> => {
  const roles = await prisma.userRole.findMany({
    where: activeRoleWhere(userId),
    orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      scope: true,
      collegeId: true,
      departmentId: true,
      sessionId: true,
      expiresAt: true,
      college: { select: { name: true } },
      department: { select: { name: true } },
      session: { select: { name: true } },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    role: role.role,
    scope: role.scope,
    collegeId: role.collegeId,
    departmentId: role.departmentId,
    sessionId: role.sessionId,
    expiresAt: role.expiresAt,
    collegeName: role.college?.name ?? null,
    departmentName: role.department?.name ?? null,
    sessionName: role.session?.name ?? null,
  }));
};

export const isPlatformAdmin = (roles: readonly AuthRole[]): boolean =>
  roles.some((role) => role.role === "PLATFORM_ADMIN");

/** A Platform Admin passes every role check (A.4). */
export const hasRole = (roles: readonly AuthRole[], ...wanted: UserRoleType[]): boolean =>
  roles.some((role) => role.role === "PLATFORM_ADMIN" || wanted.includes(role.role));

export const hasAnyRole = (roles: readonly AuthRole[]): boolean => roles.length > 0;

/** True when the user's profile has been verified (only ACTIVE profiles may act). */
export const hasActiveProfile = (user: Pick<AuthUser, "profile">): boolean =>
  user.profile?.verificationStatus === "ACTIVE";

/** CR / Co-CR titles are organizational: both moderate their own batch. */
export const isClassRepresentative = (roles: readonly AuthRole[]): boolean =>
  roles.some((role) => role.role === "CR" || role.role === "CO_CR");

/** The college a user belongs to, derived from the profile (roles are optional). */
export const collegeIdOf = (user: Pick<AuthUser, "profile" | "roles">): string | null => {
  if (user.profile) return user.profile.collegeId;

  const collegeRole = user.roles.find((role) => role.collegeId);

  return collegeRole?.collegeId ?? null;
};
