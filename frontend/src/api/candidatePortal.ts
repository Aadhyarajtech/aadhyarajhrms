import { api } from "@/lib/api";
import type { Candidate } from "@/types";

export interface CandidatePortalData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobPostingId: string;
  jobTitle: string;
  offer: Candidate["offer"];
  backgroundVerification: Candidate["backgroundVerification"];
  preboarding: Candidate["preboarding"];
}

export const CandidatePortalApi = {
  get: (token: string) =>
    api
      .get<{
        candidate: CandidatePortalData;
      }>(`/recruitment/candidate-portal/${encodeURIComponent(token)}`)
      .then((r) => r.data.candidate),

  respond: (token: string, status: "ACCEPTED" | "DECLINED") =>
    api
      .post<{
        candidate: CandidatePortalData;
      }>(`/recruitment/candidate-portal/${encodeURIComponent(token)}/respond`, { status })
      .then((r) => r.data.candidate),

  uploadDocument: (token: string, type: string, file: File) => {
    const form = new FormData();
    form.append("type", type);
    form.append("document", file);

    return api
      .post<{
        candidate: CandidatePortalData;
      }>(`/recruitment/candidate-portal/${encodeURIComponent(token)}/preboarding/documents/upload`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data.candidate);
  },
};
