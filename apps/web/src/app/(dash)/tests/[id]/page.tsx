"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { staffApi, ApiError, type StaffUser } from "@/lib/api";
import { can } from "@/lib/permissions";
import type { TestDetail } from "@/components/test/types";
import { OverviewTab } from "@/components/test/OverviewTab";
import { QuestionsTab } from "@/components/test/QuestionsTab";
import { InvitationsTab } from "@/components/test/InvitationsTab";
import { ResultsTab } from "@/components/test/ResultsTab";
import { PlagiarismTab } from "@/components/test/PlagiarismTab";
import { AnalyticsTab } from "@/components/test/AnalyticsTab";
import { ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { Tabs, TabList, Tab as TabItem, TabPanel } from "@/components/Tabs";

const TABS = ["Overview", "Questions", "Invitations", "Results", "Analytics", "Plagiarism"] as const;
type Tab = (typeof TABS)[number];

// Mirrors each tab's own backend requirePermission gate (test.routes.ts,
// result.routes.ts, integrity.routes.ts). Overview has no entry here since
// reaching this page at all already required one of tests/invitations/
// results/analytics (the page's own GET /api/tests/:id OR-gate).
function tabsFor(user: StaffUser): Tab[] {
  return TABS.filter((t) => {
    switch (t) {
      case "Overview":
        return true;
      case "Questions":
        return can(user, "tests");
      case "Invitations":
        return can(user, "invitations");
      case "Results":
        return can(user, "results");
      case "Analytics":
        return can(user, "analytics");
      case "Plagiarism":
        return can(user, "integrity");
    }
  });
}

export default function TestDetailPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  // Same SWR key as (dash)/layout.tsx's own /api/auth/me fetch, so this page
  // reuses that cached response instead of firing a duplicate request.
  const { data: userData } = useSWR<{ user: StaffUser }>("/api/auth/me", staffApi);
  const user = userData?.user ?? null;

  const reload = useCallback(async () => {
    try {
      const d = await staffApi<{ test: TestDetail }>(`/api/tests/${params.id}`);
      setTest(d.test);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this test");
    }
  }, [params.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loadError) return <ErrorNote message={loadError} />;
  if (!test || !user) return <Spinner />;

  const visibleTabs = tabsFor(user);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{test.title}</h1>
          <StatusBadge status={test.status} />
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {test.durationMinutes} min · {test.questions.length} question
          {test.questions.length === 1 ? "" : "s"} · {test._count.invitations} invited
        </p>
      </div>

      <Tabs value={activeTab} onChange={(v) => setTab(v as Tab)}>
        <TabList>
          {visibleTabs.map((t) => (
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
