import { Router } from "express";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { singleFile } from "../../middleware/upload.js";
import { checkUploadAuth } from "../../middleware/uploadAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./resource.controller.js";
import {
  listOwnResourcesQuerySchema,
  listResourcesQuerySchema,
  resourceIdParamsSchema,
  uploadResourceSchema,
} from "./resource.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/resources`.
 *
 * Uploads accept either a session or a short-lived upload token (S3-B8), then
 * parse the multipart body, then validate the text fields. The file is only
 * buffered once the caller is authenticated.
 *
 * Reads (S3-B4) are `optionalAuth`: a guest browses PLATFORM resources, a signed-in
 * viewer gets their own matrix row, and visibility always comes from
 * `lib/visibility.ts`.
 */
export const resourceRouter = Router();

resourceRouter.post(
  "/",
  checkUploadAuth,
  singleFile("file"),
  validateRequest({ body: uploadResourceSchema }),
  controller.uploadResource,
);

resourceRouter.get(
  "/",
  optionalAuth,
  validateRequest({ query: listResourcesQuerySchema }),
  controller.listResources,
);

// Before `/:id`, otherwise "mine" would be parsed as a resource id.
resourceRouter.get(
  "/mine",
  optionalAuth,
  validateRequest({ query: listOwnResourcesQuerySchema }),
  controller.listOwnResources,
);

resourceRouter.get(
  "/:id/download",
  optionalAuth,
  validateRequest({ params: resourceIdParamsSchema }),
  controller.downloadResource,
);

resourceRouter.get(
  "/:id",
  optionalAuth,
  validateRequest({ params: resourceIdParamsSchema }),
  controller.getResource,
);
