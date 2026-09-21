export interface ResumeAutofillResult {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export async function generateResumeAutofill(
  resumeText: string,
): Promise<ResumeAutofillResult> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

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
        temperature: 0.1,
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content: `
You are an HR resume data extraction assistant.

Extract candidate contact information from the provided resume text.

Rules:
1. Use ONLY information explicitly present in the resume.
2. Do NOT invent or guess any information.
3. If a field is missing or unclear, return an empty string.
4. Extract the candidate's actual name, not a company name or reference name.
5. Extract the candidate's email address if explicitly present.
6. Extract the candidate's phone number if explicitly present.
7. Do not extract Expected CTC or any salary information.
8. Return ONLY valid JSON.
9. Do not include markdown or explanations.

Return exactly this structure:

{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": ""
}
            `.trim(),
          },
          {
            role: "user",
            content: resumeText,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq API request failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq returned invalid JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null
  ) {
    throw new Error("Invalid resume autofill response.");
  }

  const result = parsed as Record<string, unknown>;

  return {
    firstName:
      typeof result.firstName === "string"
        ? result.firstName.trim()
        : "",
    lastName:
      typeof result.lastName === "string"
        ? result.lastName.trim()
        : "",
    email:
      typeof result.email === "string"
        ? result.email.trim()
        : "",
    phone:
      typeof result.phone === "string"
        ? result.phone.trim()
        : "",
  };
}