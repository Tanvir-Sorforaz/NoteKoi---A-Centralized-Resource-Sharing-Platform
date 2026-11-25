import { z } from "zod";

/** `/departments/:id/sessions` (S1-B13). */
export const departmentIdParamsSchema = z.object({
  id: z.uuid("Select a valid department"),
});
