import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { DepartmentSessionsResponse } from "./department.interface.js";

/** S1-B13 — active sessions of a department, for the register form. */
export const listSessionsOfDepartment = async (departmentId: string): Promise<DepartmentSessionsResponse> => {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, name: true },
  });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  const sessions = await prisma.session.findMany({
    where: { departmentId, isActive: true },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  return {
    department,
    sessions: sessions.map((session) => ({
      id: session.id,
      name: session.name,
      startDate: session.startDate ? session.startDate.toISOString().slice(0, 10) : null,
      endDate: session.endDate ? session.endDate.toISOString().slice(0, 10) : null,
    })),
  };
};
