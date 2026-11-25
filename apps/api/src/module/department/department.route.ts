import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./department.controller.js";
import { departmentIdParamsSchema } from "./department.validation.js";

/** Mounted by routes/index.ts at `/api/v1/departments`. */
export const departmentRouter = Router();

departmentRouter.get("/:id/sessions", validateRequest({ params: departmentIdParamsSchema }), controller.listSessions);
