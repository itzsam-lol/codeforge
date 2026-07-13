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
import { AnalyticsTab } from "@/components/test/AnalyticsTab";
import { Badge, Spinner, statusBadgeColor } from "@/components/ui";
import { Tabs, TabList, Tab as TabItem, TabPanel } from "@/components/Tabs";
import { titleCase } from "@/lib/format";

const TABS = ["Overview", "Questions", "Invitations", "Results", "Analytics", "Plagiarism"] as const;
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
        <p className="mt-1 text-sm text-on-surface-variant">
          {test.durationMinutes} min · {test.questions.length} question
          {test.questions.length === 1 ? "" : "s"} · {test._count.invitations} invited
        </p>
      </div>

      <Tabs value={tab} onChange={(v) => setTab(v as Tab)}>
        <TabList>
          {TABS.map((t) => (
            <TabItem key={t} value={t}>
              {t}
            </TabItem>
          ))}
        </TabList>
        <div className="mt-5">
          <TabPanel value="Overview">
            <OverviewTab test={test} onChanged={reload} />
          </TabPanel>
          <TabPanel value="Questions">
            <QuestionsTab test={test} onChanged={reload} />
          </TabPanel>
          <TabPanel value="Invitations">
            <InvitationsTab test={test} />
          </TabPanel>
          <TabPanel value="Results">
            <ResultsTab testId={test.id} />
          </TabPanel>
          <TabPanel value="Analytics">
            <AnalyticsTab testId={test.id} />
          </TabPanel>
          <TabPanel value="Plagiarism">
            <PlagiarismTab test={test} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
