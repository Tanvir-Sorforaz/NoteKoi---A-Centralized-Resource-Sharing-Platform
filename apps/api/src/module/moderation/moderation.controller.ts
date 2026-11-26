import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as moderationService from "./moderation.service.js";
import type {
  ModerationQueueQuery,
  ModerationResourceIdParams,
  RejectResourceInput,
} from "./moderation.validation.js";

/** GET /api/v1/moderation/queue — the caller's pending work, oldest first (S3-B6). */
export const listQueue: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ModerationQueueQuery>(res);
  const result = await moderationService.listModerationQueue(requireAuth(req), query);

  sendResponse(res, {
    message: "Moderation queue loaded",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

/** POST /api/v1/moderation/resources/:id/open — PENDING → IN_REVIEW. */
export const openForReview: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ModerationResourceIdParams>(res);
  const result = await moderationService.openForReview(requireAuth(req), params.id);

  sendResponse(res, { message: "Resource opened for review", data: result });
};

/** POST /api/v1/moderation/resources/:id/approve */
export const approveResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ModerationResourceIdParams>(res);
  const result = await moderationService.approveResource(requireAuth(req), params.id);

  sendResponse(res, { message: "Resource approved", data: result });
};

/** POST /api/v1/moderation/resources/:id/reject — the reason is mandatory. */
export const rejectResource: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<RejectResourceInput, never, ModerationResourceIdParams>(res);
  const result = await moderationService.rejectResource(requireAuth(req), params.id, body.reason);

  sendResponse(res, { message: "Resource rejected", data: result });
};
