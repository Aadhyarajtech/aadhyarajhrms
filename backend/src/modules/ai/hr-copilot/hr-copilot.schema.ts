import { z } from "zod";

/**
 * ============================================================================
 * HR COPILOT REQUEST SCHEMA
 * ============================================================================
 *
 * Validates requests coming from the HRMS frontend.
 *
 * IMPORTANT:
 *
 * This schema only validates input shape.
 *
 * It does NOT:
 * - authenticate the user
 * - authorize access
 * - determine employee scope
 * - retrieve HR data
 * - decide which modules the user can access
 *
 * Authentication is handled by the auth middleware.
 * Authorization is handled by the Copilot context + secure tool executor.
 */

/**
 * ============================================================================
 * CONVERSATION MESSAGE
 * ============================================================================
 */
const hrCopilotConversationMessageSchema =
  z.object({
    role: z.enum([
      "user",
      "assistant",
    ]),

    content: z
      .string()
      .trim()
      .min(
        1,
        "Conversation message cannot be empty.",
      )
      .max(
        10000,
        "Conversation message is too long.",
      ),
  });

/**
 * ============================================================================
 * PAGE CONTEXT
 * ============================================================================
 *
 * Page context helps the Copilot understand where the user currently is.
 *
 * It is contextual only and MUST NOT be treated as an authorization boundary.
 */
const hrCopilotPageContextSchema =
  z.object({
    pathname: z
      .string()
      .trim()
      .max(500)
      .optional(),

    pageTitle: z
      .string()
      .trim()
      .max(300)
      .optional(),

    entityId: z
      .string()
      .trim()
      .max(200)
      .optional(),

    module: z
      .string()
      .trim()
      .max(100)
      .optional(),
  });

/**
 * ============================================================================
 * MAIN COPILOT REQUEST
 * ============================================================================
 */
export const hrCopilotMessageSchema =
  z.object({
    /**
     * Current user message.
     */
    message: z
      .string()
      .trim()
      .min(
        1,
        "Message is required.",
      )
      .max(
        4000,
        "Message is too long.",
      ),

    /**
     * Previous conversation messages.
     *
     * Limited intentionally so large conversation histories do not consume
     * excessive context or Groq tokens.
     */
    conversation: z
      .array(
        hrCopilotConversationMessageSchema,
      )
      .max(
        20,
        "Conversation history is too long.",
      )
      .optional()
      .default([]),

    /**
     * Current page information.
     *
     * This is only contextual information.
     */
    pageContext:
      hrCopilotPageContextSchema
        .optional(),
  });

/**
 * ============================================================================
 * INFERRED REQUEST TYPE
 * ============================================================================
 */
export type HrCopilotMessageInput =
  z.infer<
    typeof hrCopilotMessageSchema
  >;
