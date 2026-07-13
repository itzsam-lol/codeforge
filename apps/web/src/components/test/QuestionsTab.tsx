"use client";

import { useEffect, useMemo, useState } from "react";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";
import { staffApi, ApiError } from "@/lib/api";
import type { TestDetail } from "./types";
import { Badge, Button, Card, EmptyState, ErrorNote, Input } from "../ui";
import { IconChevronDown, IconChevronUp } from "../icons";
import { titleCase, typeBadgeColor } from "@/lib/format";

interface BankQuestion {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  tags: string[];
}

interface PoolRow {
  id: string;
  name: string;
  questionIds: string[];
}

interface Row {
  questionId?: string;
  poolId?: string;
  title: string;
  type?: string;
  difficulty?: string;
  points: number;
}

export function QuestionsTab({ test, onChanged }: { test: TestDetail; onChanged: () => void }) {
  const locked = test.status !== "draft";
  const [rows, setRows] = useState<Row[]>(
    test.questions.map((tq) =>
      tq.question
        ? {
            questionId: tq.question.id,
            title: tq.question.title,
            type: tq.question.type,
            difficulty: tq.question.difficulty,
            points: tq.points,
          }
        : {
            poolId: tq.pool!.id,
            title: `Pool: ${tq.pool!.name}`,
            points: tq.points,
          }
    )
  );
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // --- Pool creation state ---
  const [poolName, setPoolName] = useState("");
  const [poolPicks, setPoolPicks] = useState<Set<string>>(new Set());
  const [poolBusy, setPoolBusy] = useState(false);

  const loadPools = () =>
    staffApi<{ pools: PoolRow[] }>(`/api/tests/${test.id}/pools`).then((d) => setPools(d.pools));

  useEffect(() => {
    staffApi<{ questions: BankQuestion[] }>("/api/questions").then((d) => setBank(d.questions));
    loadPools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedIds = useMemo(
    () => new Set(rows.flatMap((r) => (r.questionId ? [r.questionId] : []))),
    [rows]
  );
  const usedPoolIds = useMemo(
    () => new Set(rows.flatMap((r) => (r.poolId ? [r.poolId] : []))),
    [rows]
  );
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
        body: {
          items: rows.map((r) => ({
            questionId: r.questionId,
            poolId: r.poolId,
            points: r.points,
          })),
        },
      });
      setDirty(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function createPool() {
    setPoolBusy(true);
    try {
      await staffApi(`/api/tests/${test.id}/pools`, {
        method: "POST",
        body: { name: poolName.trim(), questionIds: [...poolPicks] },
      });
      setPoolName("");
      setPoolPicks(new Set());
      await loadPools();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create pool");
    } finally {
      setPoolBusy(false);
    }
  }

  async function deletePool(poolId: string) {
    if (!confirm("Delete this pool? Any test slot using it will also be removed on next save.")) return;
    await staffApi(`/api/tests/${test.id}/pools/${poolId}`, { method: "DELETE" });
    mutate((prev) => prev.filter((r) => r.poolId !== poolId));
    await loadPools();
  }

  const totalPoints = rows.reduce((s, r) => s + r.points, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Test questions <span className="font-normal text-slate-500">({totalPoints} pts)</span>
          </h3>
          {!locked ? (
            <Button size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save order & points"}
            </Button>
          ) : (
            <span className="text-xs text-slate-500">Locked after publish</span>
          )}
        </div>
        {error ? <div className="mb-2"><ErrorNote message={error} /></div> : null}
        {rows.length === 0 ? (
          <EmptyState title="No questions yet" hint="Add questions or pools from the bank on the right." />
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.questionId ?? `pool-${r.poolId}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="w-5 text-xs font-semibold text-slate-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="mt-0.5 flex gap-1.5">
                    {r.poolId ? (
                      <Badge color="indigo">
                        Pool · {pools.find((p) => p.id === r.poolId)?.questionIds.length ?? "?"} options
                      </Badge>
                    ) : (
                      <>
                        <Badge color={typeBadgeColor(r.type as QuestionType)}>
                          {QUESTION_TYPE_LABELS[r.type as QuestionType] ?? r.type}
                        </Badge>
                        <Badge>{titleCase(r.difficulty!)}</Badge>
                      </>
                    )}
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
                        className="px-1 text-slate-500 transition-colors hover:text-slate-700"
                        aria-label="Move up"
                      >
                        <IconChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        className="px-1 text-slate-500 transition-colors hover:text-slate-700"
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

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Question bank</h3>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {available.map((q) => (
              <div key={q.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{q.title}</div>
                  <div className="mt-0.5 flex gap-1.5">
                    <Badge color={typeBadgeColor(q.type)}>
                      {QUESTION_TYPE_LABELS[q.type as QuestionType] ?? q.type}
                    </Badge>
                    <Badge>{titleCase(q.difficulty)}</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={locked}
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
              <p className="py-6 text-center text-xs text-slate-500">No more matching questions.</p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">
            Question pools <span className="font-normal text-slate-500">(spec 3.3: interchangeable slots)</span>
          </h3>
          <p className="text-xs text-slate-500">
            Each candidate gets one random pick from the pool, frozen on their session, so
            candidates who take the test at different times don&apos;t all see the same question.
          </p>
          {pools.length === 0 && locked ? (
            <p className="text-xs text-slate-500">No pools were configured on this test.</p>
          ) : null}
          {pools.length > 0 ? (
            <div className="space-y-1.5">
              {pools.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-slate-500">{p.questionIds.length} question(s)</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={locked || usedPoolIds.has(p.id)}
                    onClick={() =>
                      mutate((prev) => [...prev, { poolId: p.id, title: `Pool: ${p.name}`, points: 20 }])
                    }
                  >
                    {usedPoolIds.has(p.id) ? "In use" : "Add as slot"}
                  </Button>
                  {!locked ? (
                    <button
                      onClick={() => deletePool(p.id)}
                      className="font-medium text-rose-500 hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {!locked ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <Input
                placeholder="Pool name, e.g. Array warm-up (variant A/B)"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
              />
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {bank.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={poolPicks.has(q.id)}
                      onChange={() =>
                        setPoolPicks((prev) => {
                          const next = new Set(prev);
                          next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                          return next;
                        })
                      }
                    />
                    <span className="truncate">{q.title}</span>
                    <span className="text-slate-500">({q.type})</span>
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={poolBusy || !poolName.trim() || poolPicks.size < 2}
                onClick={createPool}
              >
                {poolBusy ? "Creating…" : `Create pool (${poolPicks.size} picked, need ≥2)`}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
