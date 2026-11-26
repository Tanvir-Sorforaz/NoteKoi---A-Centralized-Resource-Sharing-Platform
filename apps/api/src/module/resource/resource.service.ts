import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { AudienceType, UploaderType } from "../../../generated/prisma/enums.js";
import { isClassRepresentative, isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { removeStoredFile, sha256, storeFile, type StoredObject } from "../../lib/drive.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { ResourceDetail, ResourceUploadResult, ResourceVersionView } from "./resource.interface.js";
import type { UploadResourceInput } from "./resource.validation.js";

/**
 * S3-B3 — uploading a resource.
 *
 * The file is stored first, then `PhysicalFile` + `Resource` + `ResourceVersion`
 * v1 (+ `ResourceBatchGrant` rows for PERMITTED) are written in one transaction.
 * If that transaction fails the freshly stored bytes are deleted again, so the
 * file host never keeps an orphan (playbook §10, S3-B3).
 */

/** What the caller's role allows at upload time (playbook §10 role table). */
interface UploadPolicy {
  uploaderType: UploaderType;
  allowedAudiences: readonly AudienceType[];
  defaultAudience: AudienceType;
  state: "PENDING" | "APPROVED";
  collegeId: string | null;
  isStudent: boolean;
  /** A student's own batch; `null` for teachers and Platform Admins. */
  sessionId: string | null;
}

const STUDENT_AUDIENCES = ["COLLEGE"] as const;
const CR_AUDIENCES = ["COLLEGE", "PLATFORM"] as const;
const TEACHER_AUDIENCES = ["PRIVATE", "PERMITTED", "PLATFORM"] as const;
const ADMIN_AUDIENCES = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"] as const;

const uploadPolicy = (auth: AuthUser): UploadPolicy => {
  if (isPlatformAdmin(auth.roles)) {
    return {
      uploaderType: "ADMIN",
      allowedAudiences: ADMIN_AUDIENCES,
      defaultAudience: "PRIVATE",
      state: "APPROVED",
      // A Platform Admin has no profile, so `collegeId` comes from the form.
      collegeId: null,
      isStudent: false,
      sessionId: null,
    };
  }

  const profile = auth.profile;

  if (!profile) {
    throw AppError.forbidden("Only a student, teacher or Platform Admin can upload", "FORBIDDEN_ROLE");
  }

  if (profile.verificationStatus !== "ACTIVE") {
    throw AppError.forbidden(
      "Your registration is not verified yet. Ask your CR (students) or Sub Admin (teachers) to approve it.",
      "PROFILE_NOT_ACTIVE",
    );
  }

  if (profile.kind === "student") {
    const representative = isClassRepresentative(auth.roles);

    return {
      uploaderType: "STUDENT",
      allowedAudiences: representative ? CR_AUDIENCES : STUDENT_AUDIENCES,
      defaultAudience: "COLLEGE",
      // A CR / Co-CR upload skips the queue (A.4); a regular student's does not.
      state: representative ? "APPROVED" : "PENDING",
      collegeId: profile.collegeId,
      isStudent: true,
      sessionId: profile.sessionId,
    };
  }

  return {
    uploaderType: "TEACHER",
    allowedAudiences: TEACHER_AUDIENCES,
    defaultAudience: "PRIVATE",
    state: "APPROVED",
    collegeId: profile.collegeId,
    isStudent: false,
    sessionId: null,
  };
};

const audienceNotAllowed = (policy: UploadPolicy): AppError =>
  policy.isStudent
    ? AppError.forbidden(
        "Students can only post to their own college. Only a CR or Co-CR may publish to the platform.",
        "AUDIENCE_NOT_ALLOWED",
      )
    : AppError.forbidden("Teachers can upload as PRIVATE, PERMITTED or PLATFORM", "AUDIENCE_NOT_ALLOWED");

interface UploadContext {
  collegeId: string;
  departmentId: string;
  courseId: string;
  audience: AudienceType;
  state: "PENDING" | "APPROVED";
  /** Batches the resource is shared with; non-empty only for PERMITTED. */
  sessionIds: string[];
  policy: UploadPolicy;
}

/** Every scope rule that needs the database, with the message the user sees. */
const resolveUploadContext = async (
  auth: AuthUser,
  input: UploadResourceInput,
): Promise<UploadContext> => {
  const policy = uploadPolicy(auth);
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: {
      id: true,
      isActive: true,
      departmentId: true,
      department: { select: { isActive: true } },
    },
  });

  if (!course) {
    throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  }

  if (!course.isActive) {
    throw AppError.badRequest("This course is deactivated", "COURSE_INACTIVE");
  }

  if (!course.department.isActive) {
    throw AppError.badRequest("This department is deactivated", "DEPARTMENT_INACTIVE");
  }

  const profile = auth.profile;

  if (policy.isStudent && (profile?.kind !== "student" || course.departmentId !== profile.departmentId)) {
    throw AppError.badRequest("Pick a course of your own department", "INVALID_COURSE");
  }

  if (
    policy.uploaderType === "TEACHER" &&
    (profile?.kind !== "teacher" || !profile.departmentIds.includes(course.departmentId))
  ) {
    throw AppError.badRequest("Pick a course of one of your departments", "INVALID_COURSE");
  }

  const collegeId = policy.collegeId ?? input.collegeId;

  if (!collegeId) {
    throw AppError.badRequest(
      "A Platform Admin must choose the college the resource belongs to",
      "COLLEGE_REQUIRED",
    );
  }

  const collegeDepartment = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId, departmentId: course.departmentId } },
    select: { college: { select: { isActive: true } } },
  });

  if (!collegeDepartment) {
    throw AppError.badRequest("That college does not offer this course's department", "INVALID_COLLEGE");
  }

  if (!collegeDepartment.college.isActive) {
    throw AppError.badRequest("That college is deactivated", "COLLEGE_INACTIVE");
  }

  const audience = input.audience ?? policy.defaultAudience;

  if (!policy.allowedAudiences.includes(audience)) {
    throw audienceNotAllowed(policy);
  }

  const sessionIds = [...new Set(input.sessionIds ?? [])];

  if (sessionIds.length > 0) {
    if (audience !== "PERMITTED") {
      throw AppError.badRequest("Only a PERMITTED resource is shared with batches", "INVALID_SESSIONS");
    }

    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds }, departmentId: course.departmentId, isActive: true },
      select: { id: true },
    });

    if (sessions.length !== sessionIds.length) {
      throw AppError.badRequest(
        "Every batch must be an active session of the resource's department",
        "INVALID_SESSIONS",
      );
    }
  }

  return {
    collegeId,
    departmentId: course.departmentId,
    courseId: course.id,
    audience,
    state: policy.state,
    sessionIds,
    policy,
  };
};

const detailSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  uploaderType: true,
  collegeId: true,
  departmentId: true,
  courseId: true,
  sessionId: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  uploader: { select: { id: true, name: true } },
  college: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  course: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
  versions: {
    orderBy: { versionNo: "asc" },
    select: {
      id: true,
      versionNo: true,
      state: true,
      rejectionReason: true,
      createdAt: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
  batchGrants: { select: { sessionId: true, session: { select: { name: true } } } },
} as const;

type DetailRow = Prisma.ResourceGetPayload<{ select: typeof detailSelect }>;

const parseTags = (tags: string | null): string[] =>
  tags
    ? tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

const toVersionView = (version: DetailRow["versions"][number]): ResourceVersionView => ({
  id: version.id,
  versionNo: version.versionNo,
  state: version.state,
  rejectionReason: version.rejectionReason,
  createdAt: version.createdAt.toISOString(),
  mimeType: version.physicalFile?.mimeType ?? null,
  sizeBytes: version.physicalFile ? Number(version.physicalFile.sizeBytes) : null,
});

export const toResourceDetail = (row: DetailRow): ResourceDetail => ({
  id: row.id,
  title: row.title,
  description: row.description,
  tags: parseTags(row.tags),
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  uploaderType: row.uploaderType,
  collegeId: row.collegeId,
  departmentId: row.departmentId,
  courseId: row.courseId,
  sessionId: row.sessionId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  uploader: row.uploader,
  college: row.college,
  department: row.department,
  course: row.course,
  session: row.session,
  currentVersionId: row.currentVersionId,
  versions: row.versions.map(toVersionView),
  grants: row.batchGrants.map((grant) => ({
    sessionId: grant.sessionId,
    sessionName: grant.session.name,
  })),
});

/** The multipart file, as `singleFile()` leaves it on the request. */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const storageUnavailable = (): AppError =>
  AppError.serviceUnavailable(
    "The file could not be stored. Please retry in a moment.",
    "STORAGE_UNAVAILABLE",
  );

/** S3-B3 — `POST /api/v1/resources` (multipart: fields + `file`). */
export const uploadResource = async (
  auth: AuthUser,
  input: UploadResourceInput,
  file: UploadedFile | undefined,
): Promise<ResourceUploadResult> => {
  if (!file) {
    throw AppError.badRequest("Attach the file to upload", "FILE_REQUIRED");
  }

  const context = await resolveUploadContext(auth, input);
  const contentHash = sha256(file.buffer);

  // Dedup (A.12): identical bytes reuse the existing PhysicalFile row.
  const existingFile = await prisma.physicalFile.findUnique({
    where: { contentHash },
    select: { id: true },
  });

  let physicalFileId = existingFile?.id ?? null;
  let stored: StoredObject | null = null;

  if (!physicalFileId) {
    const newFileId = randomUUID();

    try {
      stored = await storeFile({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileId: newFileId,
      });
    } catch {
      throw storageUnavailable();
    }

    physicalFileId = newFileId;
  }

  const storedFile = stored;
  const storedFileId = physicalFileId;
  const versionState = context.state === "APPROVED" ? "APPROVED" : "PENDING";

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (storedFile) {
        await tx.physicalFile.create({
          data: {
            id: storedFileId as string,
            contentHash,
            sizeBytes: BigInt(file.size),
            mimeType: file.mimetype,
            storageProvider: storedFile.provider,
            driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
            driveFolderId: storedFile.folderId,
            driveWebViewLink: storedFile.webViewLink,
            driveWebContentLink: storedFile.webContentLink,
          },
        });
      }

      const resource = await tx.resource.create({
        data: {
          uploaderId: auth.userId,
          uploaderType: context.policy.uploaderType,
          collegeId: context.collegeId,
          departmentId: context.departmentId,
          courseId: context.courseId,
          sessionId: context.policy.sessionId,
          title: input.title,
          description: input.description ?? null,
          tags: input.tags && input.tags.length > 0 ? input.tags.join(",") : null,
          resourceType: input.resourceType,
          audience: context.audience,
          state: context.state,
        },
        select: { id: true },
      });

      const version = await tx.resourceVersion.create({
        data: {
          resourceId: resource.id,
          versionNo: 1,
          physicalFileId: storedFileId,
          state: versionState,
          uploadedById: auth.userId,
        },
        select: { id: true },
      });

      await tx.resource.update({
        where: { id: resource.id },
        data: { currentVersionId: version.id },
      });

      if (context.audience === "PERMITTED" && context.sessionIds.length > 0) {
        await tx.resourceBatchGrant.createMany({
          data: context.sessionIds.map((sessionId) => ({
            resourceId: resource.id,
            sessionId,
            collegeId: context.collegeId,
            departmentId: context.departmentId,
            grantedById: auth.userId,
          })),
        });
      }

      return tx.resource.findUniqueOrThrow({ where: { id: resource.id }, select: detailSelect });
    });

    return { ...toResourceDetail(created), deduplicated: Boolean(existingFile) };
  } catch (error) {
    // The DB write failed after the bytes were stored, so drop them again.
    if (storedFile && storedFileId) {
      await removeStoredFile({
        storageProvider: storedFile.provider,
        driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
        id: storedFileId,
      }).catch(() => undefined);
    }

    throw error;
  }
};
