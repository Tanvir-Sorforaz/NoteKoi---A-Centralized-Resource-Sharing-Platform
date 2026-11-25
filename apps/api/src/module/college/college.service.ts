import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { CollegeDepartmentsResponse, CollegeListResponse } from "./college.interface.js";

/**
 * S1-B13 — public lookups that feed the register form. Read-only, no auth.
 * Admin CRUD arrives in S2-B2.
 */
export const listColleges = async (): Promise<CollegeListResponse> => {
  const colleges = await prisma.college.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return { colleges };
};

export const listDepartmentsOfCollege = async (collegeId: string): Promise<CollegeDepartmentsResponse> => {
  const college = await prisma.college.findFirst({
    where: { id: collegeId, isActive: true },
    select: { id: true, name: true },
  });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  const links = await prisma.collegeDepartment.findMany({
    where: { collegeId, department: { isActive: true } },
    orderBy: { department: { name: "asc" } },
    select: { adoptedAt: true, department: { select: { id: true, name: true } } },
  });

  return {
    college,
    departments: links.map((link) => ({
      id: link.department.id,
      name: link.department.name,
      adoptedAt: link.adoptedAt.toISOString(),
    })),
  };
};
