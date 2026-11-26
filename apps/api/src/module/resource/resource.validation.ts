import { z } from "zod";

/** Q1 (playbook §11) — the only resource types the UI offers. */
export const RESOURCE_TYPES = ["NOTES", "SLIDES", "ASSIGNMENT", "QUESTION_BANK", "BOOK", "OTHER"] as const;

export const AUDIENCES = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"] as const;

export const resourceIdParamsSchema = z.object({
  id: z.uuid("Select a valid resource"),
});

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Multipart repeats the field (`sessionIds=a&sessionIds=b`), JSON clients send an array. */
const uuidList = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return value;
}, z.array(z.uuid("Select valid sessions")).max(50, "Select at most 50 sessions").optional());

/** `tags` arrives as a repeated field, a comma list, or an array. Stored comma-joined. */
const tagsInput = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : value;

  if (!Array.isArray(raw)) return value;

  const cleaned = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
    .filter((entry) => entry !== "");

  return cleaned.length > 0 ? cleaned : undefined;
}, z.array(z.string().trim().min(1, "Tags must not be empty").max(32, "A tag is too long")).max(10, "Add at most 10 tags").optional());

/**
 * S3-B3 — `POST /resources` body (multipart; the file itself is on `file`).
 * `collegeId` is only read for a Platform Admin, who has no profile to derive it
 * from. A student's session is taken from their profile, never from the form.
 */
export const uploadResourceSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long"),
    description: z.preprocess(emptyToUndefined, z.string().trim().max(2000, "Description is too long").optional()),
    tags: tagsInput,
    resourceType: z.enum(RESOURCE_TYPES, "Select a resource type"),
    audience: z.enum(AUDIENCES, "Select an audience").optional(),
    courseId: z.uuid("Select a valid course"),
    collegeId: z.preprocess(emptyToUndefined, z.uuid("Select a valid college").optional()),
    sessionIds: uuidList,
  })
  .superRefine((value, ctx) => {
    if (value.audience === "PERMITTED" && (!value.sessionIds || value.sessionIds.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionIds"],
        message: "Pick at least one batch to share a PERMITTED resource with",
      });
    }
  });

export type UploadResourceInput = z.infer<typeof uploadResourceSchema>;
