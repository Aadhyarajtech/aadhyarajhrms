import crypto from "node:crypto";
import { Candidate, JobPosting } from "@/db/models";
import { nowIso } from "../../db/connection";
import * as recruitmentRepo from "./recruitment.repository";

type AnyDoc = Record<string, any>;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safePortalCandidate(candidate: AnyDoc, job: AnyDoc | null) {
  const offer = candidate.offer
    ? {
        status: candidate.offer.status,
        offerUrl: candidate.offer.offerUrl,
        annualCtc: candidate.offer.annualCtc,
        basic: candidate.offer.basic,
        hra: candidate.offer.hra,
        specialAllowance: candidate.offer.specialAllowance,
        joiningDate: candidate.offer.joiningDate,
        generatedAt: candidate.offer.generatedAt,
        respondedAt: candidate.offer.respondedAt,
        viewedAt: candidate.offer.viewedAt,
      }
    : null;

  return {
    id: candidate._id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    jobPostingId: candidate.jobPostingId,
    jobTitle: job?.title ?? "",
    offer,
    backgroundVerification: candidate.backgroundVerification,
    preboarding: candidate.preboarding,
  };
}

export async function getCandidateByToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return undefined;

  const candidate = await Candidate.findOne({
    "offer.accessTokenHash": hashToken(normalized),
  }).lean();

  if (!candidate?.offer?.accessTokenExpiresAt) return undefined;

  if (Date.parse(candidate.offer.accessTokenExpiresAt) < Date.now()) {
    return undefined;
  }

  if (candidate.offer.status === "NOT_GENERATED") return undefined;

  const job = await JobPosting.findById(candidate.jobPostingId).lean();

  if (!candidate.offer.viewedAt) {
    await Candidate.updateOne(
      { _id: candidate._id },
      { $set: { "offer.viewedAt": nowIso() } },
    );
    candidate.offer.viewedAt = nowIso();
  }

  return safePortalCandidate(candidate, job);
}

async function getCandidateIdByToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return undefined;

  const candidate = await Candidate.findOne({
    "offer.accessTokenHash": hashToken(normalized),
  })
    .select("_id offer jobPostingId")
    .lean();

  if (!candidate?.offer?.accessTokenExpiresAt) return undefined;
  if (Date.parse(candidate.offer.accessTokenExpiresAt) < Date.now())
    return undefined;

  return String(candidate._id);
}

export async function respondToOfferByToken(
  token: string,
  status: "ACCEPTED" | "DECLINED",
) {
  const candidateId = await getCandidateIdByToken(token);
  if (!candidateId) return undefined;

  const updated = await recruitmentRepo.respondToOffer(candidateId, status);
  return updated;
}

export async function addPreboardingDocumentByToken(
  token: string,
  type: string,
  url: string,
) {
  const candidateId = await getCandidateIdByToken(token);
  if (!candidateId) return undefined;

  return recruitmentRepo.addPreboardingDocument(candidateId, type, url);
}
