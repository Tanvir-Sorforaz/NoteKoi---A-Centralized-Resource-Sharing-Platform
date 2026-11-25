import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as collegeService from "./college.service.js";

/** GET /api/v1/colleges */
export const listColleges: RequestHandler = async (_req, res) => {
  const result = await collegeService.listColleges();

  sendResponse(res, { message: "Colleges", data: result.colleges, meta: { total: result.colleges.length } });
};

/** GET /api/v1/colleges/:id/departments */
export const listDepartments: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await collegeService.listDepartmentsOfCollege(params.id);

  sendResponse(res, {
    message: "Departments of the college",
    data: result,
    meta: { total: result.departments.length },
  });
};
