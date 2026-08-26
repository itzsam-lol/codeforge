"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SectionHeading } from "@/components/SectionHeading";
import { arenaApi } from "@/lib/arenaApi";

interface SubmissionRow {
  id: string;
  mode: "contest" | "practice";
  problemTitle: string;
  status: string;
  language: string | null;
  score: number;
  submittedAt: string;
}

interface SubmissionsResponse {
  submissions: SubmissionRow[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUS_COLOR: Record<string, string> = {
  accepted: "text-emerald-400",
  wrong_answer: "text-rose-400",
  pending: "text-amber-400",
  runtime_error: "text-rose-400",
  compile_error: "text-rose-400",
  time_limit_exceeded: "text-amber-400",
  memory_limit_exceeded: "text-amber-400",
  internal_error: "text-rose-400",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ArenaSubmissionHistoryPage() {
  const { handle } = useParams<{ handle: string }>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<SubmissionsResponse>(
    `/api/arena/users/${handle}/submissions?page=${page}`,
    arenaApi
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="px-6 py-20">
      <SectionHeading eyebrow="Arena" title="Submission history" tone="dark" subtitle={`@${handle}`} />
      <div className="mx-auto mt-10 max-w-3xl">
        <Link href={`/arena/profile/${handle}`} className="text-sm text-accent-soft hover:underline">
          &larr; Back to profile
        </Link>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
          ) : !data || data.submissions.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No submissions yet.</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Problem</th>
                  <th className="px-4 py-2.5 font-medium">Verdict</th>
                  <th className="px-4 py-2.5 font-medium">Language</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-slate-200">
                      {s.problemTitle}
                      <span className="ml-2 text-xs text-slate-500">{s.mode}</span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${STATUS_COLOR[s.status] ?? "text-slate-400"}`}>
                      {s.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{s.language ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">{s.score}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmtDate(s.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md bg-white/5 px-3 py-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md bg-white/5 px-3 py-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
