import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { viewerFromAuth } from "../../lib/visibility.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as resourceService from "./resource.service.js";
import type {
  ListOwnResourcesQuery,
  ListResourcesQuery,
  UploadResourceInput,
} from "./resource.validation.js";

interface ResourceIdParams {
  id: string;
}

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

/** GET /api/v1/resources — browse + search, guest-friendly (S3-B4). */
export const listResources: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListResourcesQuery>(res);
  const result = await resourceService.listResources(viewerFromAuth(req.auth), query);

  sendResponse(res, {
    message: "Resources loaded",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

/** GET /api/v1/resources/mine — the uploader's own rows, any state (S3-F2). */
export const listOwnResources: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListOwnResourcesQuery>(res);
  const result = await resourceService.listOwnResources(viewerFromAuth(req.auth), query);

  sendResponse(res, {
    message: "Your uploads",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

/** GET /api/v1/resources/:id — detail (S3-B4). */
export const getResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const resource = await resourceService.getResourceDetail(viewerFromAuth(req.auth), params.id);

  sendResponse(res, { message: "Resource loaded", data: resource });
};

/** GET /api/v1/resources/:id/download — proxied bytes, never a Drive URL (S3-B4). */
export const downloadResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const download = await resourceService.openResourceDownload(viewerFromAuth(req.auth), params.id);
  const fallback = download.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

  res.setHeader("Content-Type", download.mimeType);
  res.setHeader("Content-Length", String(download.sizeBytes));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
  );
  res.setHeader("X-Resource-Version", String(download.versionNo));
  res.setHeader("Cache-Control", "private, no-store");

  // The stream can fail after the headers went out; all that is left is to abort.
  download.stream.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.status(502).json({ success: false, message: "The file could not be read", code: "STORAGE_UNAVAILABLE" });
  });

  download.stream.pipe(res);
};
