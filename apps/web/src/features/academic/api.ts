import { apiGet } from "@/lib/api";

export interface CollegeSummary {
  id: string;
  name: string;
}

export interface CollegeDepartmentSummary {
  id: string;
  name: string;
  adoptedAt: string;
}

export interface CollegeDepartments {
  college: CollegeSummary;
  departments: CollegeDepartmentSummary[];
}

export interface SessionSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface DepartmentSessions {
  department: { id: string; name: string };
  sessions: SessionSummary[];
}

/** Public lookups that feed the register form (S1-B13). */
export const fetchColleges = (signal?: AbortSignal): Promise<CollegeSummary[]> =>
  apiGet<CollegeSummary[]>("/colleges", signal);

export const fetchCollegeDepartments = (collegeId: string, signal?: AbortSignal): Promise<CollegeDepartments> =>
  apiGet<CollegeDepartments>(`/colleges/${collegeId}/departments`, signal);

export const fetchDepartmentSessions = (departmentId: string, signal?: AbortSignal): Promise<DepartmentSessions> =>
  apiGet<DepartmentSessions>(`/departments/${departmentId}/sessions`, signal);
