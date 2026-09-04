import { api } from "@/lib/api";

export interface PublicJob {
  id: string;
  title: string;
  departmentName: string;
  designationTitle: string;
  location: string;
  employmentType: string;
  experienceMin: number;
  experienceMax: number;
  description: string;
  openings: number;
  postedAt: string;
  postingChannels: string[];
  screeningQuestions: string[];
  hiringMode: "STANDARD" | "WALK_IN" | "CAMPUS";
  skills: string[];
  budgetCtc: number | null;
}

export const PublicRecruitmentApi = {
  jobs: () =>
    api
      .get<{ jobs: PublicJob[] }>("/recruitment/public/jobs")
      .then((r) => r.data.jobs),

  job: (id: string) =>
    api
      .get<{ job: PublicJob }>(`/recruitment/public/jobs/${id}`)
      .then((r) => r.data.job),

  apply: (
    id: string,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      expectedCtc?: number;
      applicationAnswers: Record<string, string>;
      resume?: File;
    },
  ) => {
    const form = new FormData();
    form.append("firstName", input.firstName);
    form.append("lastName", input.lastName);
    form.append("email", input.email);
    if (input.phone) form.append("phone", input.phone);
    if (input.expectedCtc != null)
      form.append("expectedCtc", String(input.expectedCtc));
    form.append("applicationAnswers", JSON.stringify(input.applicationAnswers));
    if (input.resume) form.append("resume", input.resume);

    return api
      .post<{ message: string }>(
        `/recruitment/public/jobs/${id}/applications`,
        form,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      )
      .then((r) => r.data);
  },
};
