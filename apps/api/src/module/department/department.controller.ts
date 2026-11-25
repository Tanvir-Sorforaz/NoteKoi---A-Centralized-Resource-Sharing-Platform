import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as departmentService from "./department.service.js";

/** GET /api/v1/departments/:id/sessions */
export const listSessions: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await departmentService.listSessionsOfDepartment(params.id);

  sendResponse(res, {
    message: "Sessions of the department",
    data: result,
    meta: { total: result.sessions.length },
  });
};
