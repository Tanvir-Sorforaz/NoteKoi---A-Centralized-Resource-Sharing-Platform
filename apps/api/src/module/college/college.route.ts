import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./college.controller.js";
import { collegeIdParamsSchema } from "./college.validation.js";

/** Mounted by routes/index.ts at `/api/v1/colleges`. */
export const collegeRouter = Router();

collegeRouter.get("/", controller.listColleges);
collegeRouter.get(
  "/:id/departments",
  validateRequest({ params: collegeIdParamsSchema }),
  controller.listDepartments,
);
