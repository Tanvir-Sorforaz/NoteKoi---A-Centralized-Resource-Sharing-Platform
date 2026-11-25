-- D9: integrity rules Prisma's schema language cannot express.
-- Referenced from prisma/schema/schema.prisma (datasource block comment).

-- 1) At most one ACTIVE (not revoked) SUB_ADMIN per college.
CREATE UNIQUE INDEX "unique_active_sub_admin_per_college"
  ON "user_roles" ("collegeId")
  WHERE "role" = 'SUB_ADMIN' AND "revokedAt" IS NULL;

-- 2) role and scope must agree, and the scope columns must be set accordingly.
ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_role_scope_check" CHECK (
    (
      "role" IN ('CR', 'CO_CR')
      AND "scope" = 'DEPARTMENT_SESSION'
      AND "collegeId" IS NOT NULL
      AND "departmentId" IS NOT NULL
      AND "sessionId" IS NOT NULL
    )
    OR (
      "role" = 'SUB_ADMIN'
      AND "scope" = 'COLLEGE'
      AND "collegeId" IS NOT NULL
    )
    OR (
      "role" = 'PLATFORM_ADMIN'
      AND "scope" = 'PLATFORM'
      AND "collegeId" IS NULL
      AND "departmentId" IS NULL
      AND "sessionId" IS NULL
    )
  );

-- 3) A version is either an uploaded file or an external link: exactly one.
ALTER TABLE "resource_versions"
  ADD CONSTRAINT "resource_versions_single_source_check"
  CHECK (num_nonnulls("physicalFileId", "externalUrl") = 1);

-- 4) An escalation originates from exactly one report or deletion request.
ALTER TABLE "moderation_escalations"
  ADD CONSTRAINT "moderation_escalations_single_source_check"
  CHECK (num_nonnulls("reportId", "deletionRequestId") = 1);
