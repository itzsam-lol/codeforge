"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@codeforge/shared";
import { staffApi, staffApiDownload, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Select, Spinner } from "@/components/ui";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/Table";
import { ConfirmDialog } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { QuestionTypeIcon } from "@/components/icons";
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
  const { toast } = useToast();
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [q, setQ] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (difficulty) params.set("difficulty", difficulty);
    if (q) params.set("q", q);
    staffApi<{ questions: QuestionRow[] }>(`/api/questions?${params}`)
      .then((d) => setQuestions(d.questions))
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Could not load the question bank")
      );
  }, [type, difficulty, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function duplicate(id: string) {
    setDuplicatingId(id);
    setActionError(null);
    try {
      await staffApi(`/api/questions/${id}/duplicate`, { method: "POST" });
      load();
      toast("Question duplicated.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not duplicate this question");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    try {
      await staffApi(`/api/questions/${archiveTarget}`, { method: "DELETE" });
      setArchiveTarget(null);
      load();
      toast("Question archived.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not archive this question");
    } finally {
      setArchiveBusy(false);
    }
  }

  const allSelected = Boolean(questions && questions.length > 0 && selected.size === questions.length);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set((questions ?? []).map((q) => q.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmBulkArchive() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setActionError(null);
    const count = selected.size;
    try {
      await staffApi("/api/questions/bulk", {
        method: "POST",
        body: { questionIds: [...selected], action: "archive" },
      });
      setSelected(new Set());
      setBulkArchiveConfirm(false);
      load();
      toast(`${count} question${count === 1 ? "" : "s"} archived.`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not archive the selected questions");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive this question?"
        body={
          <>
            It stays attached to historical results, but won&apos;t be selectable for new tests.
            {actionError ? <div className="mt-2"><ErrorNote message={actionError} /></div> : null}
          </>
        }
        confirmLabel="Archive"
        danger
        busy={archiveBusy}
        onCancel={() => {
          if (archiveBusy) return;
          setArchiveTarget(null);
          setActionError(null);
        }}
        onConfirm={confirmArchive}
      />
      <ConfirmDialog
        open={bulkArchiveConfirm}
        title={`Archive ${selected.size} question${selected.size === 1 ? "" : "s"}?`}
        body={
          <>
            They stay attached to historical results, but won&apos;t be selectable for new tests.
            {actionError ? <div className="mt-2"><ErrorNote message={actionError} /></div> : null}
          </>
        }
        confirmLabel="Archive"
        danger
        busy={bulkBusy}
        onCancel={() => {
          if (bulkBusy) return;
          setBulkArchiveConfirm(false);
          setActionError(null);
        }}
        onConfirm={confirmBulkArchive}
      />
      {actionError && archiveTarget === null && !bulkArchiveConfirm ? (
        <ErrorNote message={actionError} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-headline-md text-on-surface">Question bank</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => staffApiDownload("/api/questions/export.csv", "questions.csv")}
          >
            Export CSV
          </Button>
          <Link href="/questions/new">
            <Button>New question</Button>
          </Link>
        </div>
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

      {selected.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="font-medium text-on-surface-variant">{selected.size} selected</span>
          <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => setBulkArchiveConfirm(true)}>
            Archive selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            Clear selection
          </Button>
        </Card>
      ) : null}

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorNote message={loadError} />
          </div>
        ) : !questions ? (
          <Spinner />
        ) : questions.length === 0 ? (
          <EmptyState title="No questions match" hint="Create your first question to get started." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th className="pl-5">
                  <input type="checkbox" aria-label="Select all questions" checked={allSelected} onChange={toggleAll} />
                </Th>
                <Th>Question</Th>
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
                  <Td className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </Td>
                  <Td className="max-w-md">
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
                      <QuestionTypeIcon type={row.type} />
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
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={duplicatingId === row.id}
                        onClick={() => duplicate(row.id)}
                      >
                        {duplicatingId === row.id ? "Duplicating…" : "Duplicate"}
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
