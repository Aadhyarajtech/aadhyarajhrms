import { api } from "./api";

export interface RecruitmentApiResponse<T> {
  data: T;
}

export interface PipelineItem {
  stage: string;
  count: number;
}

export interface SourceAnalytics {
  source: string;
  applications: number;
  screening: number;
  interviews: number;
  offers: number;
  accepted: number;
  hired: number;
  hireConversionRate: number;
  acceptanceRate: number;
}

export interface ReferralAnalytics {
  totalReferrals: number;
  inPipeline: number;
  interviewed: number;
  offers: number;
  accepted: number;
  hired: number;
  conversionRate: number;
}

export interface VolumeHiringItem {
  source: string;
  applications: number;
  screening: number;
  interviewed: number;
  hired: number;
  conversionRate: number;
}

export interface VolumeHiringAnalytics {
  walkIn: VolumeHiringItem;
  campus: VolumeHiringItem;
}

export interface JobPosting {
  _id: string;
  id?: string;
  title?: string;
  jobTitle?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  status?: string;
  openings?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Candidate {
  _id: string;
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  stage?: string;
  status?: string;
  [key: string]: unknown;
}

export const RecruitmentApi = {
  async jobs(): Promise<JobPosting[]> {
    const response = await api.get<
      RecruitmentApiResponse<JobPosting[]> | JobPosting[]
    >("/recruitment/jobs");

    return Array.isArray(response.data)
      ? response.data
      : (response.data.data ?? []);
  },

  async pipelineSummary(): Promise<PipelineItem[]> {
    const response = await api.get<
      RecruitmentApiResponse<PipelineItem[]> | PipelineItem[]
    >("/recruitment/pipeline-summary");

    return Array.isArray(response.data)
      ? response.data
      : (response.data.data ?? []);
  },

  async candidates(jobId: string): Promise<Candidate[]> {
    const response = await api.get<
      RecruitmentApiResponse<Candidate[]> | Candidate[]
    >(`/recruitment/jobs/${jobId}/candidates`);

    return Array.isArray(response.data)
      ? response.data
      : (response.data.data ?? []);
  },

  async getSourceAnalytics(): Promise<SourceAnalytics[]> {
    const response = await api.get<
      RecruitmentApiResponse<SourceAnalytics[]> | SourceAnalytics[]
    >("/recruitment/analytics/sources");

    return Array.isArray(response.data)
      ? response.data
      : (response.data.data ?? []);
  },

  async getReferralAnalytics(): Promise<ReferralAnalytics> {
    const response = await api.get<
      RecruitmentApiResponse<ReferralAnalytics> | ReferralAnalytics
    >("/recruitment/analytics/referrals");

    return "data" in response.data ? response.data.data : response.data;
  },

  async selectCandidate(id: string): Promise<Candidate> {
    const response = await api.post<
      RecruitmentApiResponse<Candidate> | { candidate: Candidate }
    >(`/recruitment/candidates/${id}/select`);
    return "data" in response.data
      ? response.data.data
      : response.data.candidate;
  },

  async updateReferralBonusStatus(
    id: string,
    status: "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "PAID",
  ): Promise<Candidate> {
    const response = await api.patch<{ candidate: Candidate }>(
      `/recruitment/candidates/${id}/referral-bonus`,
      { status },
    );
    return response.data.candidate;
  },

  async updateInterviewRecording(id: string, recordingUrl: string | null) {
    const response = await api.patch<{ interview: unknown }>(
      `/recruitment/interviews/${id}/recording`,
      { recordingUrl },
    );
    return response.data.interview;
  },

  async getVolumeHiringAnalytics(): Promise<VolumeHiringAnalytics> {
    const response = await api.get<
      RecruitmentApiResponse<VolumeHiringAnalytics> | VolumeHiringAnalytics
    >("/recruitment/analytics/volume-hiring");

    return "data" in response.data ? response.data.data : response.data;
  },
};
