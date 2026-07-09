"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { staffApi } from "@/lib/api";
import type { TestDetail } from "@/components/test/types";
import { OverviewTab } from "@/components/test/OverviewTab";
import { QuestionsTab } from "@/components/test/QuestionsTab";
import { InvitationsTab } from "@/components/test/InvitationsTab";
import { ResultsTab } from "@/components/test/ResultsTab";
import { PlagiarismTab } from "@/components/test/PlagiarismTab";
import { Badge, Spinner, cn, statusBadgeColor } from "@/components/ui";
import { titleCase } from "@/lib/format";

const TABS = ["Overview", "Questions", "Invitations", "Results", "Plagiarism"] as const;
type Tab = (typeof TABS)[number];

export default function TestDetailPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  const reload = useCallback(async () => {
    const d = await staffApi<{ test: TestDetail }>(`/api/tests/${params.id}`);
    setTest(d.test);
  }, [params.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!test) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{test.title}</h1>
          <Badge color={statusBadgeColor(test.status)}>{titleCase(test.status)}</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {test.durationMinutes} min · {test.questions.length} question
          {test.questions.length === 1 ? "" : "s"} · {test._count.invitations} invited
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150",
              tab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div key={tab} className="cf-fade-in">
        {tab === "Overview" ? <OverviewTab test={test} onChanged={reload} /> : null}
        {tab === "Questions" ? <QuestionsTab test={test} onChanged={reload} /> : null}
        {tab === "Invitations" ? <InvitationsTab test={test} /> : null}
        {tab === "Results" ? <ResultsTab testId={test.id} /> : null}
        {tab === "Plagiarism" ? <PlagiarismTab test={test} /> : null}
      </div>
    </div>
  );
}
