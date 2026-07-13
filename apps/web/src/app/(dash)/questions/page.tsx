"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";
import { staffApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { ConfirmDialog } from "@/components/Modal";
import { fmtDateTime, titleCase, typeBadgeColor } from "@/lib/format";

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
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);

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

  async function confirmArchive() {
    if (!archiveTarget) return;
    await staffApi(`/api/questions/${archiveTarget}`, { method: "DELETE" });
    setArchiveTarget(null);
    load();
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive this question?"
        body="It stays attached to historical results, but won't be selectable for new tests."
        confirmLabel="Archive"
        danger
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Question bank</h1>
        <Link href="/questions/new">
          <Button>New question</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search title"
          placeholder="Search title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-40">
          <option value="">All types</option>
          {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-40">
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
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">Question</Th>
                <Th>Type</Th>
                <Th>Difficulty</Th>
                <Th>Tags</Th>
                <Th>Cases</Th>
                <Th>Subs</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </Thead>
            <Tbody>
              {questions.map((row) => (
                <Tr key={row.id}>
                  <Td className="max-w-md pl-5">
                    <Link
                      href={`/questions/${row.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.version > 1 ? (
                      <span className="ml-2 text-xs text-on-surface-variant">v{row.version}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge color={typeBadgeColor(row.type)}>
                      {QUESTION_TYPE_LABELS[row.type as QuestionType] ?? row.type}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge color={difficultyColor[row.difficulty as keyof typeof difficultyColor]}>
                      {titleCase(row.difficulty)}
                    </Badge>
                  </Td>
                  <Td className="max-w-40 truncate text-xs text-on-surface-variant">
                    {row.tags.join(", ")}
                  </Td>
                  <Td>{row.type === "dsa" ? row._count.testCases : "-"}</Td>
                  <Td>{row._count.submissions}</Td>
                  <Td className="text-on-surface-variant">{fmtDateTime(row.updatedAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => duplicate(row.id)}>
                        Duplicate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row.id)}>
                        Archive
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
