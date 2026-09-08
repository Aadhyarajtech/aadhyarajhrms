import { Router } from "express";
import { z } from "zod";
import { upload, UPLOADS_PUBLIC_PATH } from "@/middleware/upload";
import { AppError } from "@/utils/errors";
import * as repo from "./recruitment.repository";
import { parseResumeFile } from "./resumeParser";

export const publicRecruitmentRouter = Router();

const applicationSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  expectedCtc: z.coerce.number().min(0).optional(),
  applicationAnswers: z.string().optional(),
});

publicRecruitmentRouter.get("/jobs", async (_req, res, next) => {
  try {
    res.json({ jobs: await repo.listPublicJobPostings() });
  } catch (err) {
    next(err);
  }
});

publicRecruitmentRouter.get("/jobs/:id", async (req, res, next) => {
  try {
    const job = await repo.getPublicJobPosting(req.params.id);
    if (!job) throw AppError.notFound("Job posting not found.");
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

publicRecruitmentRouter.post(
  "/jobs/:id/applications",
  upload.single("resume"),
  async (req, res, next) => {
    try {
      const parsed = applicationSchema.safeParse(req.body);
      if (!parsed.success)
        throw AppError.badRequest("Please provide valid application details.");

      const job = await repo.getPublicJobPosting(req.params.id);
      if (!job)
        throw AppError.notFound(
          "Job posting not found or applications are closed.",
        );

      let applicationAnswers: Record<string, string> = {};
      if (parsed.data.applicationAnswers?.trim()) {
        try {
          const raw = JSON.parse(parsed.data.applicationAnswers);
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("invalid");
          }
          applicationAnswers = Object.fromEntries(
            Object.entries(raw).map(([key, value]) => [
              key,
              String(value ?? ""),
            ]),
          );
        } catch {
          throw AppError.badRequest("Screening answers must be valid JSON.");
        }
      }

      for (const question of job.screeningQuestions ?? []) {
        if (!String(applicationAnswers[question] ?? "").trim()) {
          throw AppError.badRequest(`Please answer: ${question}`);
        }
      }

      const candidate = await repo.createCandidate({
        jobPostingId: req.params.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        expectedCtc: parsed.data.expectedCtc,
        source: "CAREERS",
        applicationAnswers,
      });

      if (!candidate)
        throw AppError.badRequest(
          "Unable to create the candidate application.",
        );

      let updatedCandidate = candidate;
      if (req.file) {
        const resumeUrl = `${UPLOADS_PUBLIC_PATH}/${req.file.filename}`;
        const resumeCandidate = await repo.setCandidateResume(candidate.id, {
          resumeUrl,
        });
        if (resumeCandidate) updatedCandidate = resumeCandidate;

        if (resumeCandidate) {
          try {
            const parsedResume = await parseResumeFile(resumeUrl);
            const parsedCandidate = await repo.updateParsedResume(
              candidate.id,
              {
                resumeText: parsedResume.text,
                extractedSkills: parsedResume.skills,
                extractedExperience: parsedResume.experience,
                extractedEducation: parsedResume.education,
              },
            );
            if (parsedCandidate) updatedCandidate = parsedCandidate;
          } catch {
            // The application remains valid even when parsing fails; HR can retry parsing later.
          }
        }
      }

      res.status(201).json({
        message: "Application submitted successfully.",
        candidate: updatedCandidate,
      });
    } catch (err) {
      next(err);
    }
  },
);
