"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { staffApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

interface QuestionRow {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  tags: string[];
  version: number;
  updatedAt: string;
  createdBy: { name: string };
  _count: { testCases: number; submissions: number; testQuestions: number };
}

const difficultyColor = { easy: "green", medium: "amber", hard: "red" } as const;

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null);
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (difficulty) params.set("difficulty", difficulty);
    if (q) params.set("q", q);
    staffApi<{ questions: QuestionRow[] }>(`/api/questions?${params}`).then((d) =>
      setQuestions(d.questions)
    );
  }, [type, difficulty, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function duplicate(id: string) {
    await staffApi(`/api/questions/${id}/duplicate`, { method: "POST" });
    load();
  }

  async function archive(id: string) {
    if (!confirm("Archive this question? It stays attached to historical results.")) return;
    await staffApi(`/api/questions/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Question bank</h1>
        <Link href="/questions/new">
          <Button>New question</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
          <option value="">All types</option>
          <option value="dsa">DSA / Coding</option>
          <option value="mcq">MCQ / MSQ</option>
        </Select>
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-40">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>
      </div>

      <Card>
        {!questions ? (
          <Spinner />
        ) : questions.length === 0 ? (
          <EmptyState title="No questions match" hint="Create your first question to get started." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-2 font-medium">Question</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Difficulty</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Cases</th>
                <th className="px-3 py-2 font-medium">Subs</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {questions.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="max-w-md px-5 py-2.5">
                    <Link
                      href={`/questions/${row.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.version > 1 ? (
                      <span className="ml-2 text-xs text-slate-400">v{row.version}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={row.type === "dsa" ? "indigo" : "blue"}>
                      {row.type.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={difficultyColor[row.difficulty as keyof typeof difficultyColor]}>
                      {titleCase(row.difficulty)}
                    </Badge>
                  </td>
                  <td className="max-w-40 truncate px-3 py-2.5 text-xs text-slate-500">
                    {row.tags.join(", ")}
                  </td>
                  <td className="px-3 py-2.5">{row.type === "dsa" ? row._count.testCases : "—"}</td>
                  <td className="px-3 py-2.5">{row._count.submissions}</td>
                  <td className="px-3 py-2.5 text-slate-500">{fmtDateTime(row.updatedAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => duplicate(row.id)}>
                        Duplicate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => archive(row.id)}>
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
