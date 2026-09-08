import type {
  AttendanceAnomalyResult,
} from "./attendance.anomaly";

/**
 * Generate an AI explanation for already-detected
 * attendance anomalies.
 *
 * Important:
 * - Anomaly detection is deterministic and happens
 *   in attendance.anomaly.ts.
 * - Groq is used only to explain the results.
 * - AI failure must never break the Attendance page.
 */
export async function generateAttendanceAnomalyInsights(
  result: AttendanceAnomalyResult,
) {
  /*
   * No anomalies means there is nothing useful
   * to send to the AI.
   */
  if (result.anomalies.length === 0) {
    return {
      summary:
        "No significant attendance anomalies were detected for the selected period.",

      recommendation:
        "Continue maintaining the current attendance pattern.",
    };
  }

  const apiKey = process.env.GROQ_API_KEY;

  /*
   * If Groq is not configured, return a deterministic
   * fallback instead of breaking the Attendance page.
   */
  if (!apiKey) {
    return {
      summary: buildFallbackSummary(result),

      recommendation:
        "Review the detected attendance patterns and verify any unusual records.",
    };
  }

  try {
    const model =
      process.env.GROQ_MODEL ||
      "openai/gpt-oss-20b";

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model,

          temperature: 0.2,

          max_completion_tokens: 300,

          messages: [
            {
              role: "system",

              content: `
You are an HR attendance analysis assistant.

Your job is to explain attendance anomalies that have already been detected by the backend.

Follow these rules strictly:

1. Do not invent attendance records.
2. Do not invent dates, times, or employee information.
3. Do not calculate new metrics.
4. Do not decide that an employee is late using a fixed company shift time.
5. Do not treat missing attendance records as absence.
6. Do not treat holidays as absence.
7. Do not treat weekends as absence.
8. Do not treat approved leave as absence.
9. Do not make disciplinary or employment decisions.
10. Do not accuse an employee of misconduct.
11. Use neutral and professional language.
12. Mention that the analysis is based on available attendance data when appropriate.
13. Return ONLY valid JSON.

Return exactly this structure:

{
  "summary": "Short explanation of the detected attendance patterns.",
  "recommendation": "Practical and neutral recommendation."
}
              `.trim(),
            },

            {
              role: "user",

              content: JSON.stringify({
                period: result.period,

                anomalies: result.anomalies,

                baseline: result.baseline,

                dataQuality:
                  result.dataQuality,
              }),
            },
          ],

          /*
           * Keep the response structured so the frontend
           * always receives predictable fields.
           */
          response_format: {
            type: "json_schema",

            json_schema: {
              name:
                "attendance_anomaly_insight",

              strict: true,

              schema: {
                type: "object",

                properties: {
                  summary: {
                    type: "string",
                  },

                  recommendation: {
                    type: "string",
                  },
                },

                required: [
                  "summary",
                  "recommendation",
                ],

                additionalProperties: false,
              },
            },
          },
        }),
      },
    );

    /*
     * Groq returned an HTTP error.
     */
    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "Groq Attendance Anomaly API error:",
        response.status,
        errorText,
      );

      throw new Error(
        `Groq API request failed with status ${response.status}`,
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
        data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Groq returned an empty response.",
      );
    }

    /*
     * The JSON-schema response should normally be a
     * JSON string. Keep support for an object as well.
     */
    const parsed =
      typeof content === "string"
        ? JSON.parse(content)
        : content;

    if (
      typeof parsed.summary !==
        "string" ||
      typeof parsed.recommendation !==
        "string"
    ) {
      throw new Error(
        "Groq returned an invalid attendance anomaly response.",
      );
    }

    return {
      summary: parsed.summary,

      recommendation:
        parsed.recommendation,
    };
  } catch (error) {
    /*
     * AI failure must never make Attendance fail.
     */
    console.error(
      "Attendance anomaly AI failed:",
      error,
    );

    return {
      summary:
        buildFallbackSummary(result),

      recommendation:
        "Review the detected attendance patterns and verify any unusual records.",
    };
  }
}

/**
 * Deterministic fallback used when:
 * - GROQ_API_KEY is missing
 * - Groq API fails
 * - Groq returns invalid JSON
 */
function buildFallbackSummary(
  result: AttendanceAnomalyResult,
): string {
  const {
    total,
    high,
    medium,
    low,
  } = result.summary;

  if (total === 0) {
    return (
      "No significant attendance anomalies were detected."
    );
  }

  const severityParts: string[] = [];

  if (high > 0) {
    severityParts.push(
      `${high} high`,
    );
  }

  if (medium > 0) {
    severityParts.push(
      `${medium} medium`,
    );
  }

  if (low > 0) {
    severityParts.push(
      `${low} low`,
    );
  }

  const severityText =
    severityParts.length > 0
      ? ` (${severityParts.join(", ")} severity)`
      : "";

  return (
    `${total} attendance ${
      total === 1
        ? "anomaly was"
        : "anomalies were"
    } detected${severityText} in the selected attendance period.`
  );
}