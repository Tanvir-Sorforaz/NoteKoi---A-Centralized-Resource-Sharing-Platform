/*
  Warnings:

  - You are about to drop the `Comment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeletionRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ModerationEscalation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `uploaderType` to the `resources` table without a default value. This is not possible if the table is not empty.
  - Made the column `courseId` on table `resources` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STUDENT', 'TEACHER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UploaderType" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "DeletionRequest" DROP CONSTRAINT "DeletionRequest_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "DeletionRequest" DROP CONSTRAINT "DeletionRequest_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "DeletionRequest" DROP CONSTRAINT "DeletionRequest_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationEscalation" DROP CONSTRAINT "ModerationEscalation_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationEscalation" DROP CONSTRAINT "ModerationEscalation_deletionRequestId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationEscalation" DROP CONSTRAINT "ModerationEscalation_escalatedById_fkey";

-- DropForeignKey
ALTER TABLE "ModerationEscalation" DROP CONSTRAINT "ModerationEscalation_reportId_fkey";

-- DropForeignKey
ALTER TABLE "ModerationEscalation" DROP CONSTRAINT "ModerationEscalation_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_reporterId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_resolvedById_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_courseId_fkey";

-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "uploaderType" "UploaderType" NOT NULL,
ALTER COLUMN "courseId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "includeOtherColleges" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "type" "UserType" NOT NULL DEFAULT 'STUDENT';

-- DropTable
DROP TABLE "Comment";

-- DropTable
DROP TABLE "DeletionRequest";

-- DropTable
DROP TABLE "ModerationEscalation";

-- DropTable
DROP TABLE "Report";

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_escalations" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "reportId" UUID,
    "deletionRequestId" UUID,
    "escalatedById" UUID NOT NULL,
    "assignedToId" UUID,
    "reason" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_resourceId_idx" ON "reports"("resourceId");

-- CreateIndex
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");

-- CreateIndex
CREATE INDEX "deletion_requests_status_createdAt_idx" ON "deletion_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "deletion_requests_resourceId_idx" ON "deletion_requests"("resourceId");

-- CreateIndex
CREATE INDEX "deletion_requests_requesterId_idx" ON "deletion_requests"("requesterId");

-- CreateIndex
CREATE INDEX "moderation_escalations_status_createdAt_idx" ON "moderation_escalations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_escalations_resourceId_idx" ON "moderation_escalations"("resourceId");

-- CreateIndex
CREATE INDEX "moderation_escalations_assignedToId_status_idx" ON "moderation_escalations"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "comments_resourceId_createdAt_idx" ON "comments"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_authorId_idx" ON "comments"("authorId");

-- CreateIndex
CREATE INDEX "idx_resource_college_audience_state_course" ON "resources"("collegeId", "audience", "state", "courseId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_escalations" ADD CONSTRAINT "moderation_escalations_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_escalations" ADD CONSTRAINT "moderation_escalations_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_escalations" ADD CONSTRAINT "moderation_escalations_deletionRequestId_fkey" FOREIGN KEY ("deletionRequestId") REFERENCES "deletion_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_escalations" ADD CONSTRAINT "moderation_escalations_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_escalations" ADD CONSTRAINT "moderation_escalations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_courseId_departmentId_fkey" FOREIGN KEY ("courseId", "departmentId") REFERENCES "courses"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
