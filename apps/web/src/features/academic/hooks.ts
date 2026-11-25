"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchCollegeDepartments,
  fetchColleges,
  fetchDepartmentSessions,
  type CollegeDepartments,
  type CollegeSummary,
  type DepartmentSessions,
} from "./api";

export const academicKeys = {
  colleges: ["academic", "colleges"] as const,
  departments: (collegeId: string) => ["academic", "colleges", collegeId, "departments"] as const,
  sessions: (departmentId: string) => ["academic", "departments", departmentId, "sessions"] as const,
};

export const useColleges = () =>
  useQuery<CollegeSummary[]>({
    queryKey: academicKeys.colleges,
    queryFn: ({ signal }) => fetchColleges(signal),
    staleTime: 5 * 60_000,
  });

export const useCollegeDepartments = (collegeId: string) =>
  useQuery<CollegeDepartments>({
    queryKey: academicKeys.departments(collegeId),
    queryFn: ({ signal }) => fetchCollegeDepartments(collegeId, signal),
    enabled: collegeId.length > 0,
    staleTime: 5 * 60_000,
  });

export const useDepartmentSessions = (departmentId: string) =>
  useQuery<DepartmentSessions>({
    queryKey: academicKeys.sessions(departmentId),
    queryFn: ({ signal }) => fetchDepartmentSessions(departmentId, signal),
    enabled: departmentId.length > 0,
    staleTime: 5 * 60_000,
  });
