export interface CollegeSummary {
  id: string;
  name: string;
}

export interface CollegeDepartmentSummary {
  id: string;
  name: string;
  adoptedAt: string;
}

export interface CollegeListResponse {
  colleges: CollegeSummary[];
}

export interface CollegeDepartmentsResponse {
  college: CollegeSummary;
  departments: CollegeDepartmentSummary[];
}
