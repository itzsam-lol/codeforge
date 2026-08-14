"use client";

import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import Link from "next/link";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";
import { staffApi } from "@/lib/api";
import { Button, Card, EmptyState, Spinner, StatusBadge } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { Modal } from "@/components/Modal";
import {
  IconCheckCircle,
  IconClock,
  IconList,
  IconMonitor,
  IconFlag,
  IconCode,
  IconAlert,
  IconLock,
  IconChevronUp,
  IconChevronDown,
} from "@/components/icons";
import { fmtDateTime } from "@/lib/format";

interface Stats {
  tests: number;
  published: number;
  invitations: number;
  completed: number;
  inProgress: number;
  questions: number;
  closingSoon: number;
  avgIntegrityScore: number | null;
}

interface TestRow {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  updatedAt: string;
  counts: { questions: number; invited: number; inProgress: number; completed: number };
}

interface DashboardExtras {
  questionsByType: Partial<Record<QuestionType, number>>;
  invitationsByStatus: Partial<Record<string, number>>;
}

/** Direct-labeled horizontal bar — see apps/hq's dashboard for the same
 *  pattern/rationale (dataviz skill: identity never depends on color alone,
 *  since every bar names its own category and count in text). A soft-to-solid
 *  gradient (sequential treatment of the one hue) reads as more deliberate
 *  than a flat fill. */
function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div title={`${label}: ${count}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-on-surface">{label}</span>
        <span className="text-on-surface-variant">{count}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
          }}
        />
      </div>
    </div>
  );
}

const INVITATION_STATUS_COLOR: Record<string, string> = {
  pending: "var(--color-on-surface-variant)",
  opened: "var(--color-info)",
  started: "var(--color-accent)",
  completed: "var(--color-ok)",
  expired: "var(--color-warn)",
  revoked: "var(--color-bad)",
};

type CardKey = keyof Stats;

const CARD_DEFS: Record<CardKey, { label: string; icon: ReactNode; format?: (v: number) => string }> = {
  tests: { label: "Tests", icon: <IconList size={16} /> },
  published: { label: "Published", icon: <IconCheckCircle size={16} /> },
  questions: { label: "Questions in bank", icon: <IconCode size={16} /> },
  invitations: { label: "Candidates invited", icon: <IconFlag size={16} /> },
  inProgress: { label: "In progress now", icon: <IconClock size={16} /> },
  completed: { label: "Completed", icon: <IconMonitor size={16} /> },
  closingSoon: { label: "Closing within 7 days", icon: <IconAlert size={16} /> },
  avgIntegrityScore: { label: "Avg. integrity score", icon: <IconLock size={16} /> },
};
const DEFAULT_ORDER: CardKey[] = [
  "tests",
  "published",
  "questions",
  "invitations",
  "inProgress",
  "completed",
  "closingSoon",
  "avgIntegrityScore",
];
const STORAGE_KEY = "cf_dashboard_cards";

function loadCardOrder(): CardKey[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((k): k is CardKey => k in CARD_DEFS);
    // Any newly-added card types (from a version before they existed) get
    // appended at the end rather than silently disappearing.
    const missing = DEFAULT_ORDER.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

export default function DashboardPage() {
  // SWR caches by key, so revisiting the dashboard after navigating away
  // shows the last-known data instantly instead of a blank spinner, then
  // silently revalidates in the background.
  const { data: statsData } = useSWR<{ stats: Stats } & DashboardExtras>("/api/dashboard", staffApi);
  const stats = statsData?.stats ?? null;
  // The dashboard is the universal landing page for every staff account
  // regardless of permission scope, but "Recent tests" depends on
  // /api/tests, which a permissions-restricted account (e.g. questions-only)
  // may not have. That must degrade gracefully, not hang the whole page on
  // an unhandled rejection.
  const { data: testsData, error: testsErr } = useSWR<{ tests: TestRow[] }>("/api/tests", staffApi);
  const tests = testsData?.tests ?? null;
  const testsBlocked = Boolean(testsErr);

  const [order, setOrder] = useState<CardKey[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Set<CardKey>>(new Set(DEFAULT_ORDER));
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const stored = loadCardOrder();
    setOrder(stored);
    const rawVisible = typeof window !== "undefined" ? window.localStorage.getItem(`${STORAGE_KEY}_visible`) : null;
    if (rawVisible) {
      try {
        setVisible(new Set((JSON.parse(rawVisible) as string[]).filter((k): k is CardKey => k in CARD_DEFS)));
      } catch {
        setVisible(new Set(stored));
      }
    } else {
      setVisible(new Set(stored));
    }
  }, []);

  function persist(nextOrder: CardKey[], nextVisible: Set<CardKey>) {
    setOrder(nextOrder);
    setVisible(nextVisible);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrder));
    window.localStorage.setItem(`${STORAGE_KEY}_visible`, JSON.stringify([...nextVisible]));
  }

  function toggle(key: CardKey) {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(order, next);
  }

  function move(key: CardKey, dir: -1 | 1) {
    const idx = order.indexOf(key);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= order.length) return;
    const next = [...order];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    persist(next, visible);
  }

  if (!stats || (!tests && !testsBlocked)) return <Spinner />;

  const fmtValue = (key: CardKey, v: number | null) => {
    if (v == null) return "-";
    return key === "avgIntegrityScore" ? `${v}/100` : String(v);
  };

  const shownCards = order.filter((k) => visible.has(k));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-md text-on-surface">Dashboard</h1>
        <Button variant="secondary" size="sm" onClick={() => setCustomizing(true)}>
          Customize
        </Button>
      </div>

      <div className="cf-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {shownCards.map((key) => (
          <Card key={key} className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                {CARD_DEFS[key].icon}
              </div>
              <span className="text-label-caps text-on-surface-variant">{CARD_DEFS[key].label}</span>
            </div>
            <div className="mt-2.5 text-display-lg text-on-surface">
              {fmtValue(key, stats[key])}
            </div>
          </Card>
        ))}
      </div>

      {(statsData?.questionsByType && Object.keys(statsData.questionsByType).length > 0) ||
      (statsData?.invitationsByStatus && Object.keys(statsData.invitationsByStatus).length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {statsData?.questionsByType && Object.keys(statsData.questionsByType).length > 0 ? (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-on-surface">Question bank by type</h2>
              <div className="space-y-3">
                {(Object.entries(statsData.questionsByType) as [QuestionType, number][]).map(([type, count]) => (
                  <BarRow
                    key={type}
                    label={QUESTION_TYPE_LABELS[type] ?? type}
                    count={count}
                    total={stats.questions}
                    color="var(--color-accent)"
                  />
                ))}
              </div>
            </Card>
          ) : null}
          {statsData?.invitationsByStatus && Object.keys(statsData.invitationsByStatus).length > 0 ? (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-on-surface">Candidate pipeline</h2>
              <div className="space-y-3">
                {Object.entries(statsData.invitationsByStatus).map(([status, count]) => (
                  <BarRow
                    key={status}
                    label={status.charAt(0).toUpperCase() + status.slice(1)}
                    count={count ?? 0}
                    total={stats.invitations}
                    color={INVITATION_STATUS_COLOR[status] ?? "var(--color-accent)"}
                  />
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {testsBlocked ? null : (
      <Card>
        <div className="px-5 py-3 text-sm font-semibold text-on-surface">
          Recent tests
        </div>
        {tests && tests.length === 0 ? (
          <EmptyState title="No tests yet" hint="Create one from the Tests page." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Test</Th>
                <Th>Status</Th>
                <Th>Questions</Th>
                <Th>Invited</Th>
                <Th>Completed</Th>
                <Th>Updated</Th>
              </tr>
            </Thead>
            <Tbody>
              {(tests ?? []).slice(0, 8).map((t) => (
                <Tr key={t.id}>
                  <Td className="pl-5">
                    <Link href={`/tests/${t.id}`} className="font-medium text-accent hover:underline">
                      {t.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td>{t.counts.questions}</Td>
                  <Td>{t.counts.invited}</Td>
                  <Td>{t.counts.completed}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(t.updatedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
      )}

      <Modal open={customizing} onClose={() => setCustomizing(false)} title="Customize dashboard">
        <p className="text-sm text-on-surface-variant">
          Choose which counters to show, and in what order. Saved to this browser.
        </p>
        <div className="mt-4 space-y-1.5">
          {order.map((key, i) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 rounded-md bg-surface-container px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={visible.has(key)}
                  onChange={() => toggle(key)}
                  className="accent-accent"
                />
                {CARD_DEFS[key].label}
              </label>
              <div className="flex gap-1">
                <button
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(key, -1)}
                  className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
                >
                  <IconChevronUp size={14} />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === order.length - 1}
                  onClick={() => move(key, 1)}
                  className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30"
                >
                  <IconChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => setCustomizing(false)}>
          Done
        </Button>
      </Modal>
    </div>
  );
}
