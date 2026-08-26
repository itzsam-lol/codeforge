import useSWR from "swr";
import { arenaApi } from "./arenaApi";

/** One graded test case, as returned by GET /api/arena/submissions/:id.
 *  Hidden test cases omit stdout/stderr — never exposed to the client. */
export interface SubmissionCaseResult {
  isHidden: boolean;
  passed: boolean;
  verdict: string;
  timeMs: number | null;
  memoryKb: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface SubmissionPoll {
  id: string;
  status: string;
  score: number;
  submittedAt: string;
  results: SubmissionCaseResult[] | null;
}

/**
 * Polls GET /api/arena/submissions/:id every 1.5s while status is "pending",
 * stops automatically once grading finishes — shared by the contest compete
 * page and the practice page, the only two places a submission gets created.
 */
export function useSubmissionPoll(submissionId: string | null) {
  return useSWR<SubmissionPoll>(submissionId ? `/api/arena/submissions/${submissionId}` : null, arenaApi, {
    refreshInterval: (latest) => (latest && latest.status !== "pending" ? 0 : 1500),
  });
}
