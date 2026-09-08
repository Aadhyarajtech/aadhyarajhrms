import type { AttendanceForecastResult } from "./attendance.forecast";

export interface AttendanceForecastAI {
  summary: string;
  recommendation: string;
}

export async function generateAttendanceForecastInsights(
  forecast: AttendanceForecastResult
): Promise<AttendanceForecastAI> {
  const fallback: AttendanceForecastAI = {
    summary: `Predicted attendance rate is ${forecast.forecast.predictedAttendanceRate}%. The attendance trend is ${forecast.forecast.direction.toLowerCase()}.`,
    recommendation: forecast.recommendation,
  };

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.2,
          max_completion_tokens: 300,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "attendance_forecast",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  recommendation: { type: "string" },
                },
                required: ["summary", "recommendation"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            {
              role: "system",
              content:
                "You are an HR attendance analytics assistant. Explain attendance forecasts clearly and neutrally. Use only the supplied data. Do not invent attendance records, reasons, policies, or metrics. Do not make disciplinary or employment decisions.",
            },
            {
              role: "user",
              content: JSON.stringify({
                predictedAttendanceRate:
                  forecast.forecast.predictedAttendanceRate,
                direction: forecast.forecast.direction,
                confidence: forecast.forecast.confidence,
                historicalData: forecast.historicalData,
                averageAttendanceRate: forecast.summary.averageAttendanceRate,
              }),
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return fallback;
    }

    const parsed = JSON.parse(content) as AttendanceForecastAI;

    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.recommendation !== "string"
    ) {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
}