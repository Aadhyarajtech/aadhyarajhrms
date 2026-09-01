import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export interface ParsedResume {
  text: string;
  skills: string[];
  experience: number | null;
  education: string[];
}

const SKILL_DICTIONARY = [
  "JavaScript",
  "TypeScript",
  "React",
  "React Native",
  "Next.js",
  "Node.js",
  "Express",
  "NestJS",
  "MongoDB",
  "MySQL",
  "PostgreSQL",
  "SQL",
  "Redis",
  "Java",
  "Spring",
  "Spring Boot",
  "Python",
  "Django",
  "Flask",
  "C",
  "C++",
  "C#",
  ".NET",
  "PHP",
  "Laravel",
  "Go",
  "Rust",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Bootstrap",
  "Angular",
  "Vue",
  "AWS",
  "Azure",
  "Google Cloud",
  "Docker",
  "Kubernetes",
  "Jenkins",
  "Git",
  "GitHub",
  "GitLab",
  "CI/CD",
  "Terraform",
  "Ansible",
  "Linux",
  "REST API",
  "GraphQL",
  "Microservices",
  "Machine Learning",
  "Deep Learning",
  "Artificial Intelligence",
  "LLM",
  "RAG",
  "OpenAI",
  "Power BI",
  "Tableau",
  "Excel",
  "Selenium",
  "Jest",
  "Cypress",
];

function cleanText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveResumePath(resumeUrl: string) {
  const rawValue = String(resumeUrl || "").trim();

  if (!rawValue) {
    throw new Error("Resume URL is required.");
  }

  // The API stores local public paths such as /uploads/<filename>.
  // Strip an accidental query/hash portion before resolving the filename.
  const value = rawValue.split(/[?#]/, 1)[0];

  // Uploaded resumes in this application are stored under /uploads.
  if (value.startsWith("/uploads/") || value.startsWith("uploads/")) {
    const filename = path.basename(value);
    const uploadDir = path.join(process.cwd(), "uploads");
    return path.join(uploadDir, filename);
  }

  // Also accept an absolute local path when called internally.
  if (path.isAbsolute(value)) {
    return value;
  }

  throw new Error("Resume must reference a file stored in /uploads.");
}

async function extractText(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (extension === ".pdf") {
    const result = await pdfParse(buffer);
    return cleanText(result.text);
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (extension === ".doc") {
    const extractor = new WordExtractor();
    const document = await extractor.extract(filePath);
    return cleanText(document.getBody());
  }

  throw new Error("Unsupported resume format. Use PDF, DOC, or DOCX.");
}

function extractSkills(text: string) {
  const normalized = text.toLowerCase();

  const matches = SKILL_DICTIONARY.filter((skill) => {
    const skillText = skill.toLowerCase();

    // Avoid false positives for very short/special skills.
    if (skillText === "c++" || skillText === "c#" || skillText === ".net") {
      return normalized.includes(skillText);
    }

    // Match technology names even when resumes contain common punctuation
    // variations such as React.js / React, Node.js / Node, or REST APIs.
    const escaped = skillText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const directPattern = new RegExp(
      `(^|[^a-z0-9+#.])${escaped}(?=$|[^a-z0-9+#.])`,
      "i",
    );

    if (directPattern.test(text)) {
      return true;
    }

    // Common resume variants: allow a ".js" suffix to match the base
    // technology (e.g. React.js -> React, Node.js -> Node.js).
    const withoutJs = skillText.endsWith(".js")
      ? skillText.slice(0, -3)
      : skillText;

    if (withoutJs !== skillText && withoutJs.length > 1) {
      const baseEscaped = withoutJs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      if (
        new RegExp(
          `(^|[^a-z0-9+#.])${baseEscaped}(?=\\s|$|[^a-z0-9+#.])`,
          "i",
        ).test(text)
      ) {
        return true;
      }
    }

    // Treat JavaScript as present when a resume explicitly lists
    // JavaScript or common JavaScript ecosystem terms.
    if (
      skillText === "javascript" &&
      /\bjavascript\b|\breact(?:\.js)?\b|\bnode(?:\.js)?\b|\bexpress(?:\.js)?\b/i.test(
        text,
      )
    ) {
      return true;
    }

    return false;
  });

  return [...new Set(matches)];
}

function extractExperience(text: string): number | null {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?experience/gi,
    /experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi,
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s*(?:in|of)\s+[a-z0-9+#./ -]+/gi,
  ];

  const values: number[] = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0 && value <= 60) {
        values.push(value);
      }
    }
  }

  if (!values.length) {
    return null;
  }

  // A resume can mention several durations. The largest plausible value is
  // the safest approximation of total professional experience.
  return Math.max(...values);
}

function extractEducation(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const educationKeywords = [
    "b.tech",
    "btech",
    "m.tech",
    "mtech",
    "b.e",
    "be ",
    "b.sc",
    "bsc",
    "m.sc",
    "msc",
    "bca",
    "mca",
    "mba",
    "bba",
    "phd",
    "bachelor",
    "master",
    "degree",
    "diploma",
    "university",
    "college",
  ];

  const results: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      educationKeywords.some((keyword) => lower.includes(keyword)) &&
      line.length <= 250
    ) {
      results.push(line);
    }
  }

  return [...new Set(results)].slice(0, 10);
}

export async function parseResumeFile(
  resumeUrl: string,
): Promise<ParsedResume> {
  const filePath = resolveResumePath(resumeUrl);

  try {
    await fs.access(filePath);
  } catch {
    throw new Error("Uploaded resume file could not be found.");
  }

  let text: string;

  try {
    text = await extractText(filePath);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Resume parsing failed: ${error.message}`);
    }
    throw new Error("Resume parsing failed.");
  }

  if (!text) {
    throw new Error(
      "No readable text was found in the resume. The document may be scanned or image-only.",
    );
  }

  return {
    text,
    skills: extractSkills(text),
    experience: extractExperience(text),
    education: extractEducation(text),
  };
}
