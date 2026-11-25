export interface SessionSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface DepartmentSessionsResponse {
  department: { id: string; name: string };
  sessions: SessionSummary[];
}
