import { z } from "zod";

export const hrCopilotMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required.")
    .max(4000, "Message is too long."),

  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      }),
    )
    .max(20)
    .optional()
    .default([]),

  pageContext: z
    .object({
      pathname: z.string().max(500).optional(),
      pageTitle: z.string().max(300).optional(),
      entityId: z.string().max(200).optional(),
      module: z.string().max(100).optional(),
    })
    .optional(),
});

export type HrCopilotMessageInput = z.infer<
  typeof hrCopilotMessageSchema
>;