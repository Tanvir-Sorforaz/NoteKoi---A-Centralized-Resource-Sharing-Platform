import { Router } from "express";
import { singleFile } from "../../middleware/upload.js";
import { checkUploadAuth } from "../../middleware/uploadAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./resource.controller.js";
import { uploadResourceSchema } from "./resource.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/resources`.
 *
 * Uploads accept either a session or a short-lived upload token (S3-B8), then
 * parse the multipart body, then validate the text fields. The file is only
 * buffered once the caller is authenticated.
 */
export const resourceRouter = Router();

resourceRouter.post(
  "/",
  checkUploadAuth,
  singleFile("file"),
  validateRequest({ body: uploadResourceSchema }),
  controller.uploadResource,
);
