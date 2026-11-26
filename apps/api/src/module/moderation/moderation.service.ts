import type { Prisma } from "../../../generated/prisma/client.js";
import type { ResourceState, VersionState } from "../../../generated/prisma/enums.js";
import { writeAuditLog } from "../../lib/audit.js";
import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { notifyUsers } from "../notification/notification.service.js";
import type {
  ModerationDecision,
  ModerationQueueItem,
  ModerationQueueResult,
} from "./moderation.interface.js";
import type { ModerationQueueQuery } from "./moderation.validation.js";

/**
 * S3-B6 — moderation.
 *
 * A student upload lands in PENDING; a CR/Co-CR of that batch opens it
 * (PENDING → IN_REVIEW) and then approves or rejects it with a reason. The
 * decision always moves `resources.state` and the waiting `resource_versions`
 * rows together, writes an append-only audit row, and notifies the uploader
 * through S3-B5's fan-out (never the moderator themself).
 *
 * Scope comes from `auth.roles`, not from the request: a CR only sees their own
 * batch, a Sub Admin their college, a Platform Admin everything.
 */

/** States a moderator can still move. */
const MOVABLE: ResourceState[] = ["PENDING", "IN_REVIEW"];
const MOVABLE_VERSIONS: VersionState[] = ["PENDING", "IN_REVIEW"];

interface CrScope {
  collegeId: string;
  departmentId: string;
  sessionId: string;
}

const crScopes = (auth: AuthUser): CrScope[] =>
  auth.roles.flatMap((role) => {
    if (role.role !== "CR" && role.role !== "CO_CR") return [];
    if (!role.collegeId || !role.departmentId || !role.sessionId) return [];

    return [{ collegeId: role.collegeId, departmentId: role.departmentId, sessionId: role.sessionId }];
  });

const subAdminColleges = (auth: AuthUser): string[] =>
  auth.roles.flatMap((role) => (role.role === "SUB_ADMIN" && role.collegeId ? [role.collegeId] : []));

const rowNotFound = (): AppError => AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

const notPending = (state: ResourceState): AppError =>
  AppError.conflict(
    `Only a resource that is waiting for review can be decided (this one is ${state})`,
    "RESOURCE_NOT_PENDING",
  );

/**
 * Resources the caller may moderate. Nobody moderates their own upload — a
 * Platform Admin override is S5-B4's job, not the queue's.
 */
const moderationScope = (auth: AuthUser): Prisma.ResourceWhereInput => {
  const batches = crScopes(auth);
  const colleges = subAdminColleges(auth);

  if (!isPlatformAdmin(auth.roles) && batches.length === 0 && colleges.length === 0) {
    throw AppError.forbidden(
      "Only a CR, Co-CR or Sub Admin can moderate resources",
      "FORBIDDEN_SCOPE",
    );
  }

  const audience: Prisma.ResourceWhereInput[] = [];

  if (!isPlatformAdmin(auth.roles)) {
    if (colleges.length > 0) audience.push({ collegeId: { in: colleges } });
    for (const batch of batches) {
      audience.push({
        collegeId: batch.collegeId,
        departmentId: batch.departmentId,
        sessionId: batch.sessionId,
      });
    }
  }

  return {
    AND: [
      audience.length > 0 ? { OR: audience } : {},
      { uploaderId: { not: auth.userId } },
      { deletedAt: null },
    ],
  };
};

const scopeFilters = (query: ModerationQueueQuery): Prisma.ResourceWhereInput => ({
  ...(query.collegeId ? { collegeId: query.collegeId } : {}),
  ...(query.departmentId ? { departmentId: query.departmentId } : {}),
  ...(query.sessionId ? { sessionId: query.sessionId } : {}),
});

const queueSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  createdAt: true,
  uploader: { select: { id: true, name: true, email: true } },
  course: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
  currentVersion: {
    select: {
      versionNo: true,
      state: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
} as const;

const toQueueItem = (row: {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  resourceType: string;
  audience: string;
  state: ResourceState;
  createdAt: Date;
  uploader: { id: string; name: string; email: string };
  course: { id: string; name: string };
  session: { id: string; name: string } | null;
  currentVersion: {
    versionNo: number;
    state: ModerationQueueItem["versionState"];
    physicalFile: { mimeType: string; sizeBytes: bigint } | null;
  } | null;
}): ModerationQueueItem => ({
  id: row.id,
  title: row.title,
  description: row.description,
  tags: row.tags,
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  versionNo: row.currentVersion?.versionNo ?? null,
  versionState: row.currentVersion?.state ?? null,
  mimeType: row.currentVersion?.physicalFile?.mimeType ?? null,
  sizeBytes: row.currentVersion?.physicalFile
    ? Number(row.currentVersion.physicalFile.sizeBytes)
    : null,
  createdAt: row.createdAt.toISOString(),
  uploader: row.uploader,
  course: row.course,
  session: row.session,
});

/** Finds a row by id *inside* the caller's moderation scope, or 404. */
const findModeratable = async (auth: AuthUser, id: string) => {
  const row = await prisma.resource.findFirst({
    where: { AND: [moderationScope(auth), { id }] },
    select: {
      id: true,
      title: true,
      state: true,
      audience: true,
      uploaderId: true,
      session: { select: { name: true } },
    },
  });

  if (!row) throw rowNotFound();

  return row;
};

/** GET /api/v1/moderation/queue — oldest first, so nothing starves. */
export const listModerationQueue = async (
  auth: AuthUser,
  query: ModerationQueueQuery,
): Promise<ModerationQueueResult> => {
  const where: Prisma.ResourceWhereInput = {
    AND: [
      moderationScope(auth),
      { state: query.state ?? { in: MOVABLE } },
      scopeFilters(query),
    ],
  };

  const [total, rows] = await prisma.$transaction([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: queueSelect,
    }),
  ]);

  return {
    items: rows.map((row) => toQueueItem(row)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
};

/** POST /api/v1/moderation/resources/:id/open — PENDING → IN_REVIEW. */
export const openForReview = async (
  auth: AuthUser,
  id: string,
): Promise<{ id: string; state: ResourceState; previousState: ResourceState }> => {
  const resource = await findModeratable(auth, id);

  if (resource.state === "IN_REVIEW") {
    throw AppError.conflict("This resource is already under review", "RESOURCE_ALREADY_IN_REVIEW");
  }

  if (!MOVABLE.includes(resource.state)) throw notPending(resource.state);

  await prisma.$transaction(async (tx) => {
    // The `state` guard turns two moderators opening the same row into a
    // conflict instead of a silent overwrite.
    const moved = await tx.resource.updateMany({
      where: { id, state: "PENDING" },
      data: { state: "IN_REVIEW" },
    });

    if (moved.count === 0) {
      throw AppError.conflict("This resource is already under review", "RESOURCE_ALREADY_IN_REVIEW");
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "REVIEW_STARTED",
      targetType: "RESOURCE",
      targetId: id,
      metadata: { previousState: "PENDING", audience: resource.audience },
    });
  });

  return { id, state: "IN_REVIEW", previousState: "PENDING" };
};

/**
 * The one place a decision is written: `resources.state`, every waiting
 * `resource_versions` row, the audit row and the uploader's notification commit
 * together or not at all.
 */
const decide = async (
  auth: AuthUser,
  id: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null,
): Promise<ModerationDecision> => {
  const resource = await findModeratable(auth, id);

  if (!MOVABLE.includes(resource.state)) throw notPending(resource.state);

  const decidedAt = new Date();

  const version = await prisma.$transaction(async (tx) => {
    const moved = await tx.resource.updateMany({
      where: { id, state: { in: MOVABLE } },
      data: { state: decision },
    });

    if (moved.count === 0) {
      throw AppError.conflict("This resource was already decided", "RESOURCE_ALREADY_DECIDED");
    }

    await tx.resourceVersion.updateMany({
      where: { resourceId: id, state: { in: MOVABLE_VERSIONS } },
      data: { state: decision, rejectionReason: decision === "REJECTED" ? reason : null },
    });

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: decision === "APPROVED" ? "RESOURCE_APPROVED" : "RESOURCE_REJECTED",
      targetType: "RESOURCE",
      targetId: id,
      justification: decision === "REJECTED" ? reason : null,
      metadata: { previousState: resource.state, audience: resource.audience },
    });

    await notifyUsers(tx, {
      userIds: [resource.uploaderId],
      type: decision === "APPROVED" ? "RESOURCE_APPROVED" : "RESOURCE_REJECTED",
      payload: {
        resourceId: id,
        resourceTitle: resource.title,
        ...(resource.session ? { sessionName: resource.session.name } : {}),
        ...(decision === "REJECTED" && reason ? { reason } : {}),
      },
      excludeUserId: auth.userId,
    });

    return tx.resourceVersion.findFirst({
      where: { resourceId: id },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true, state: true },
    });
  });

  return {
    id,
    state: decision,
    versionNo: version?.versionNo ?? null,
    versionState: version?.state ?? null,
    previousState: resource.state,
    reason,
    decidedAt: decidedAt.toISOString(),
  };
};

/** POST /api/v1/moderation/resources/:id/approve */
export const approveResource = (auth: AuthUser, id: string): Promise<ModerationDecision> =>
  decide(auth, id, "APPROVED", null);

/** POST /api/v1/moderation/resources/:id/reject — the reason reaches the uploader. */
export const rejectResource = (
  auth: AuthUser,
  id: string,
  reason: string,
): Promise<ModerationDecision> => decide(auth, id, "REJECTED", reason);

