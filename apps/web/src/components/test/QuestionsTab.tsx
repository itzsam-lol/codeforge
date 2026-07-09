"use client";

import { useEffect, useMemo, useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import type { TestDetail } from "./types";
import { Badge, Button, Card, EmptyState, ErrorNote, Input } from "../ui";
import { IconChevronDown, IconChevronUp } from "../icons";
import { titleCase } from "@/lib/format";

interface BankQuestion {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  tags: string[];
}

interface Row {
  questionId: string;
  title: string;
  type: string;
  difficulty: string;
  points: number;
}

export function QuestionsTab({ test, onChanged }: { test: TestDetail; onChanged: () => void }) {
  const locked = test.status !== "draft";
  const [rows, setRows] = useState<Row[]>(
    test.questions
      .filter((tq) => tq.question)
      .map((tq) => ({
        questionId: tq.question!.id,
        title: tq.question!.title,
        type: tq.question!.type,
        difficulty: tq.question!.difficulty,
        points: tq.points,
      }))
  );
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    staffApi<{ questions: BankQuestion[] }>("/api/questions").then((d) => setBank(d.questions));
  }, []);

  const usedIds = useMemo(() => new Set(rows.map((r) => r.questionId)), [rows]);
  const available = bank.filter(
    (q) =>
      !usedIds.has(q.id) &&
      (!search || q.title.toLowerCase().includes(search.toLowerCase()))
  );

  function mutate(fn: (prev: Row[]) => Row[]) {
    setRows(fn);
    setDirty(true);
  }

  function move(i: number, dir: -1 | 1) {
    mutate((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/tests/${test.id}/questions`, {
        method: "PUT",
        body: { items: rows.map((r) => ({ questionId: r.questionId, points: r.points })) },
      });
      setDirty(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const totalPoints = rows.reduce((s, r) => s + r.points, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Test questions <span className="font-normal text-slate-400">({totalPoints} pts)</span>
          </h3>
          {!locked ? (
            <Button size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save order & points"}
            </Button>
          ) : (
            <span className="text-xs text-slate-400">Locked after publish</span>
          )}
        </div>
        {error ? <div className="mb-2"><ErrorNote message={error} /></div> : null}
        {rows.length === 0 ? (
          <EmptyState title="No questions yet" hint="Add questions from the bank on the right." />
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.questionId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="w-5 text-xs font-semibold text-slate-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="mt-0.5 flex gap-1.5">
                    <Badge color={r.type === "dsa" ? "indigo" : "blue"}>{r.type.toUpperCase()}</Badge>
                    <Badge>{titleCase(r.difficulty)}</Badge>
                  </div>
                </div>
                {!locked ? (
                  <>
                    <Input
                      type="number"
                      min={1}
                      value={r.points}
                      onChange={(e) =>
                        mutate((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, points: Number(e.target.value) || 1 } : x
                          )
                        )
                      }
                      className="w-20"
                      aria-label="Points"
                    />
                    <div className="flex flex-col">
                      <button
                        onClick={() => move(i, -1)}
                        className="px-1 text-slate-400 transition-colors hover:text-slate-700"
                        aria-label="Move up"
                      >
                        <IconChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        className="px-1 text-slate-400 transition-colors hover:text-slate-700"
                        aria-label="Move down"
                      >
                        <IconChevronDown size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => mutate((prev) => prev.filter((_, j) => j !== i))}
                      className="text-xs font-medium text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">{r.points} pts</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Question bank</h3>
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {available.map((q) => (
            <div key={q.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{q.title}</div>
                <div className="mt-0.5 flex gap-1.5">
                  <Badge color={q.type === "dsa" ? "indigo" : "blue"}>{q.type.toUpperCase()}</Badge>
                  <Badge>{titleCase(q.difficulty)}</Badge>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={locked || !["dsa", "mcq"].includes(q.type)}
                onClick={() =>
                  mutate((prev) => [
                    ...prev,
                    {
                      questionId: q.id,
                      title: q.title,
                      type: q.type,
                      difficulty: q.difficulty,
                      points: q.type === "mcq" ? 5 : 20,
                    },
                  ])
                }
              >
                Add
              </Button>
            </div>
          ))}
          {available.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No more matching questions.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
