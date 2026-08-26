"use client";

import { useState } from "react";
import useSWR from "swr";
import { hqApi, ApiError } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Select, Spinner } from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  CodingSettingsPanel,
  DEFAULT_CODING_CONFIG,
  DEFAULT_MCQ_CONFIG,
  MarkdownField,
  McqOptionBuilder,
  validateCodingConfig,
  validateMcqConfig,
  type CodingConfig,
  type McqConfig,
} from "@/components/contests/QuestionBuilders";

type QuestionType = "coding" | "mcq";
type Difficulty = "easy" | "medium" | "hard";

interface BankItem {
  id: string;
  type: QuestionType;
  title: string;
  bodyMd: string;
  difficulty: Difficulty;
  points: number;
  typeConfig: unknown;
  editorial: string | null;
  tags: string[];
  updatedAt: string;
}

function BankItemForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  initial: Pick<BankItem, "type" | "title" | "bodyMd" | "difficulty" | "points" | "typeConfig" | "editorial">;
  onSubmit: (body: {
    type: QuestionType;
    title: string;
    bodyMd: string;
    difficulty: Difficulty;
    points: number;
    typeConfig: CodingConfig | McqConfig;
    editorial: string;
  }) => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [type, setType] = useState<QuestionType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [bodyMd, setBodyMd] = useState(initial.bodyMd);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty);
  const [points, setPoints] = useState(String(initial.points));
  const [editorial, setEditorial] = useState(initial.editorial ?? "");
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(
    initial.type === "coding" ? { ...DEFAULT_CODING_CONFIG, ...(initial.typeConfig as object) } : DEFAULT_CODING_CONFIG
  );
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(
    initial.type === "mcq" ? { ...DEFAULT_MCQ_CONFIG, ...(initial.typeConfig as object) } : DEFAULT_MCQ_CONFIG
  );

  const configError = type === "coding" ? validateCodingConfig(codingConfig) : validateMcqConfig(mcqConfig);

  return (
    <div className="space-y-3">
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
          <option value="coding">Coding</option>
          <option value="mcq">MCQ</option>
        </Select>
      </Field>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <MarkdownField label="Problem statement" value={bodyMd} onChange={setBodyMd} />
      <div className="flex flex-wrap gap-4">
        <Field label="Difficulty">
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
        <Field label="Points">
          <Input type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} className="w-28" />
        </Field>
      </div>
      {type === "coding" ? (
        <CodingSettingsPanel config={codingConfig} onChange={setCodingConfig} />
      ) : (
        <McqOptionBuilder config={mcqConfig} onChange={setMcqConfig} />
      )}
      {configError ? <ErrorNote message={configError} /> : null}
      <MarkdownField label="Solution / editorial (optional)" value={editorial} onChange={setEditorial} rows={5} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || Boolean(configError)}
          onClick={() =>
            onSubmit({
              type,
              title,
              bodyMd,
              difficulty,
              points: Number(points) || 1,
              typeConfig: type === "coding" ? codingConfig : mcqConfig,
              editorial: editorial.trim(),
            })
          }
        >
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const BLANK_ITEM = { type: "coding" as QuestionType, title: "", bodyMd: "", difficulty: "medium" as Difficulty, points: 100, typeConfig: DEFAULT_CODING_CONFIG, editorial: null };

export default function QuestionBankPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const qs = new URLSearchParams();
  if (search.trim()) qs.set("search", search.trim());
  if (difficulty) qs.set("difficulty", difficulty);
  const { data, error, mutate } = useSWR<{ items: BankItem[] }>(`/api/questions/bank?${qs.toString()}`, hqApi);
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load the question bank" : null;

  async function create(body: Parameters<typeof BankItemForm>[0]["initial"] & { typeConfig: CodingConfig | McqConfig }) {
    setBusy(true);
    try {
      await hqApi("/api/questions/bank", { method: "POST", body });
      toast.toast("Added to question bank");
      setCreating(false);
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, body: Parameters<typeof BankItemForm>[0]["initial"] & { typeConfig: CodingConfig | McqConfig }) {
    setBusy(true);
    try {
      await hqApi(`/api/questions/bank/${id}`, { method: "PATCH", body });
      toast.toast("Question bank item updated");
      setEditingId(null);
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await hqApi(`/api/questions/bank/${id}`, { method: "DELETE" });
      toast.toast("Removed from question bank");
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not remove", "error");
    } finally {
      setBusy(false);
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-on-surface">Question Bank</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            Reusable questions, independent of any one contest. Import one into a contest from its Questions tab, or
            push a contest question here to reuse it later.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>{creating ? "Close" : "New question"}</Button>
      </div>

      {creating ? (
        <Card className="p-5">
          <BankItemForm initial={BLANK_ITEM} submitLabel="Add to bank" busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search question bank"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select aria-label="Filter by difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="max-w-40">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </Select>
      </div>

      {loadError ? (
        <ErrorNote message={loadError} />
      ) : !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card className="p-8">
          <EmptyState title="No bank items yet" hint="Add one here, or save a contest question to the bank." />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) =>
            editingId === item.id ? (
              <Card key={item.id} className="space-y-3 border border-accent/30 p-5">
                <BankItemForm
                  initial={item}
                  submitLabel="Save"
                  busy={busy}
                  onSubmit={(body) => update(item.id, body)}
                  onCancel={() => setEditingId(null)}
                />
              </Card>
            ) : (
              <Card key={item.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-on-surface">{item.title}</p>
                  <p className="mt-0.5 text-xs capitalize text-on-surface-variant">
                    {item.type} · {item.difficulty} · {item.points} pts
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(item.id)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeletingId(item.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="Remove this question from the bank?"
        body="This only removes the bank copy — it doesn't touch any contest that already imported it. This cannot be undone."
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={() => deletingId && remove(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
