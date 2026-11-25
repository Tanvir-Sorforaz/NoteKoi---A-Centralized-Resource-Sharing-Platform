import { z } from "zod";

/** `/colleges/:id/departments` (S1-B13). */
export const collegeIdParamsSchema = z.object({
  id: z.uuid("Select a valid college"),
});
