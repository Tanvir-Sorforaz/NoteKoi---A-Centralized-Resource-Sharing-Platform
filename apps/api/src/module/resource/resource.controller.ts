import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as resourceService from "./resource.service.js";
import type { UploadResourceInput } from "./resource.validation.js";

/** POST /api/v1/resources (multipart: fields + `file`) — S3-B3. */
export const uploadResource: RequestHandler = async (req, res) => {
  const { body } = getValidated<UploadResourceInput>(res);
  const file = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : undefined;
  const resource = await resourceService.uploadResource(requireAuth(req), body, file);

  sendResponse(res, {
    message: resource.deduplicated
      ? "Resource uploaded (identical file reused)"
      : "Resource uploaded",
    data: resource,
    statusCode: 201,
  });
};
