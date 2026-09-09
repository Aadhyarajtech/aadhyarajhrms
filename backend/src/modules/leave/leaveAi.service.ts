type LeaveReasonResponse = {
  reason: string;
};

const GROQ_BASE_URL =
  process.env.GROQ_BASE_URL ||
  "https://api.groq.com/openai/v1";

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-20b";

const GROQ_TIMEOUT_MS =
  Number(process.env.GROQ_TIMEOUT_MS || 20000);

function buildFallbackReason(input: string): string {
  const cleaned = input.trim();

  if (!cleaned) {
    return "I would like to request leave for a personal reason.";
  }

  return `I would like to request leave ${cleaned
    .replace(/\.$/, "")
    .toLowerCase()}.`;
}

async function callGroq(
  input: string,
): Promise<LeaveReasonResponse> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GROQ_BASE_URL}/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
  "You are a professional HRMS leave reason assistant. Convert the employee's short leave reason into a clear, professional and sufficiently detailed leave description suitable for an official leave request. Preserve the exact meaning of the employee's input. Expand the wording naturally when possible, but never invent facts, dates, names, events, medical details, or circumstances that were not provided. The result should normally be 2 to 3 complete sentences and should sound professional and natural. Return only valid JSON.",
            },
            {
              role: "user",
             content: `
Rewrite the following leave reason into a professional and detailed leave description.

Employee reason:
${input}

Rules:
- Preserve the employee's original meaning.
- Expand the wording naturally to make it suitable for an official HRMS leave request.
- Normally provide 2 to 3 complete sentences.
- Clearly explain the purpose of the leave based only on the information provided.
- Do not invent names, dates, locations, events, medical conditions, family details, or any other facts.
- Do not change the reason or add assumptions.
- Use professional workplace language.
- Avoid unnecessary repetition.
- Return only the JSON object.
`,
            },
          ],

          temperature: 0.2,

          max_completion_tokens: 300,

          reasoning_effort: "low",

          response_format: {
            type: "json_schema",

            json_schema: {
              name: "leave_reason",

              strict: true,

              schema: {
                type: "object",

                properties: {
                  reason: {
                    type: "string",
                  },
                },

                required: ["reason"],

                additionalProperties: false,
              },
            },
          },
        }),

        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Groq request failed: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(
        "Groq returned an empty response.",
      );
    }

    const parsed = JSON.parse(content) as {
      reason?: unknown;
    };

    if (
      typeof parsed.reason !== "string" ||
      !parsed.reason.trim()
    ) {
      throw new Error(
        "Groq returned an invalid leave reason.",
      );
    }

    return {
      reason: parsed.reason.trim(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a professional leave description.
 *
 * AI is only used to improve the wording.
 * It does not validate, approve or submit the leave request.
 */
export async function generateLeaveReason(
  input: string,
): Promise<LeaveReasonResponse> {
  const cleaned = input.trim();

  if (!cleaned) {
    throw new Error(
      "Please enter a short leave reason first.",
    );
  }

  if (cleaned.length > 500) {
    throw new Error(
      "Leave reason must not exceed 500 characters.",
    );
  }

  const fallback = {
    reason: buildFallbackReason(cleaned),
  };

  try {
    return await callGroq(cleaned);
  } catch (error) {
    console.error(
      "Leave Reason AI/Groq failed. Using fallback.",
      error,
    );

    return fallback;
  }
}