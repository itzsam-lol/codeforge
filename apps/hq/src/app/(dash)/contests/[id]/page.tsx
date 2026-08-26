"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { hqApi, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { Tabs, TabList, Tab, TabPanel } from "@/components/Tabs";
import { ConfirmDialog, Modal } from "@/components/Modal";
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

interface ContestQuestion {
  id: string;
  seq: number;
  type: QuestionType;
  title: string;
  bodyMd: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  typeConfig: unknown;
  editorial: string | null;
}

interface Contest {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: "draft" | "scheduled" | "live" | "grading" | "completed" | "cancelled";
  scoringMode: "points" | "icpc_penalty";
  proctoringLevel: "none" | "basic" | "strict" | "lockdown";
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  webcamBonusPct: number;
  lockdownBonusPct: number;
  maxStrikes: number;
  startAt: string;
  endAt: string;
  syncStatus: "idle" | "pending" | "synced" | "failed";
  syncError: string | null;
  questions: ContestQuestion[];
}

interface AiDraft {
  type: QuestionType;
  title: string;
  bodyMd: string;
  difficulty: "easy" | "medium" | "hard";
  typeConfig: unknown;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


export default function ContestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, mutate } = useSWR<{ contest: Contest }>(`/api/contests/${id}`, hqApi);
  const contest = data?.contest;
  const loadError = error instanceof ApiError ? error.message : error ? "Could not load this contest" : null;

  const [tab, setTab] = useState("basic");
  const [confirmAction, setConfirmAction] = useState<"publish" | "end" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  async function sendBroadcast() {
    if (!broadcastMessage.trim()) return;
    setSendingBroadcast(true);
    try {
      await hqApi(`/api/contests/${id}/broadcast`, { method: "POST", body: { message: broadcastMessage.trim() } });
      toast.toast("Announcement sent");
      setBroadcastMessage("");
      setShowBroadcast(false);
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not send announcement", "error");
    } finally {
      setSendingBroadcast(false);
    }
  }

  async function duplicate() {
    setDuplicating(true);
    try {
      const res = await hqApi<{ contest: Contest }>(`/api/contests/${id}/duplicate`, { method: "POST" });
      toast.toast("Contest duplicated");
      router.push(`/contests/${res.contest.id}`);
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not duplicate contest", "error");
    } finally {
      setDuplicating(false);
    }
  }

  async function runAction(action: "publish" | "end" | "cancel" | "resync") {
    setBusy(true);
    try {
      await hqApi(`/api/contests/${id}/${action}`, { method: "POST" });
      toast.toast(`Contest ${action === "resync" ? "re-synced" : action + "ed"}`);
      mutate();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  if (loadError) return <ErrorNote message={loadError} />;
  if (!contest) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-headline-md text-on-surface">{contest.title}</h1>
            <StatusBadge status={contest.status} />
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            /arena/contests/{contest.slug} · sync: {contest.syncStatus}
            {contest.syncError ? ` — ${contest.syncError}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contest.syncStatus === "failed" ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => runAction("resync")}>
              Retry sync
            </Button>
          ) : null}
          {contest.status === "draft" ? (
            <Button size="sm" disabled={busy} onClick={() => setConfirmAction("publish")}>
              Publish
            </Button>
          ) : null}
          {contest.status === "live" ? (
            <Button size="sm" variant="secondary" onClick={() => setShowBroadcast(true)}>
              Send announcement
            </Button>
          ) : null}
          {["scheduled", "live"].includes(contest.status) ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmAction("end")}>
              End now
            </Button>
          ) : null}
          {!["completed", "cancelled"].includes(contest.status) ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmAction("cancel")}>
              Cancel
            </Button>
          ) : null}
          {["grading", "completed"].includes(contest.status) ? (
            <Link href={`/contests/${contest.id}/review`}>
              <Button size="sm" variant="secondary">
                AI Review
              </Button>
            </Link>
          ) : null}
          {contest.status === "completed" ? (
            <Link href={`/contests/${contest.id}/leaderboard`}>
              <Button size="sm" variant="secondary">
                View results
              </Button>
            </Link>
          ) : null}
          {contest.status !== "draft" ? (
            <Link href={`/contests/${contest.id}/analytics`}>
              <Button size="sm" variant="secondary">
                Analytics
              </Button>
            </Link>
          ) : null}
          <Button size="sm" variant="secondary" disabled={duplicating} onClick={duplicate}>
            {duplicating ? "Duplicating…" : "Duplicate"}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab}>
        <TabList>
          <Tab value="basic">Basic Info</Tab>
          <Tab value="schedule">Schedule</Tab>
          <Tab value="questions">Questions ({contest.questions.length})</Tab>
          <Tab value="scoring">Scoring &amp; Proctoring</Tab>
        </TabList>

        <TabPanel value="basic">
          <BasicInfoTab contest={contest} onSaved={mutate} />
        </TabPanel>
        <TabPanel value="schedule">
          <ScheduleTab contest={contest} onSaved={mutate} />
        </TabPanel>
        <TabPanel value="questions">
          <QuestionsTab contest={contest} onSaved={mutate} />
        </TabPanel>
        <TabPanel value="scoring">
          <ScoringTab contest={contest} onSaved={mutate} />
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === "publish"
            ? "Publish this contest?"
            : confirmAction === "end"
              ? "End this contest now?"
              : "Cancel this contest?"
        }
        body={
          confirmAction === "publish"
            ? "This schedules the contest and pushes its questions to the Arena platform. It'll go live automatically at its start time."
            : confirmAction === "end"
              ? "This cuts the contest short and moves it into grading immediately."
              : "This permanently cancels the contest. Participants will no longer be able to submit."
        }
        confirmLabel={confirmAction === "cancel" ? "Cancel contest" : "Confirm"}
        danger={confirmAction === "cancel"}
        busy={busy}
        onConfirm={() => confirmAction && runAction(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />

      <Modal open={showBroadcast} onClose={() => setShowBroadcast(false)} title="Send announcement">
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            Shown as a dismissible banner to every participant currently in the compete page.
          </p>
          <Field label="Message">
            <Textarea
              rows={4}
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="e.g. Clarification: Problem 3 test case 2 has been updated."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowBroadcast(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={sendingBroadcast || !broadcastMessage.trim()} onClick={sendBroadcast}>
              {sendingBroadcast ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BasicInfoTab({ contest, onSaved }: { contest: Contest; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(contest.title);
  const [description, setDescription] = useState(contest.description);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await hqApi(`/api/contests/${contest.id}`, { method: "PATCH", body: { title, description } });
      toast.toast("Saved");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 space-y-4 p-5">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" hint="Rendered as markdown on the public contest page">
        <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Button size="sm" disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </Card>
  );
}

function ScheduleTab({ contest, onSaved }: { contest: Contest; onSaved: () => void }) {
  const toast = useToast();
  const [startAt, setStartAt] = useState(toLocalInput(contest.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(contest.endAt));
  const [saving, setSaving] = useState(false);
  const locked = contest.status !== "draft";

  async function save() {
    setSaving(true);
    try {
      await hqApi(`/api/contests/${contest.id}`, {
        method: "PATCH",
        body: { startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() },
      });
      toast.toast("Saved");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 space-y-4 p-5">
      {locked ? (
        <p className="text-xs text-on-surface-variant">
          Schedule is locked once a contest leaves draft status. Cancel and recreate it to change timing.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <Field label="Start">
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={locked} />
        </Field>
        <Field label="End">
          <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} disabled={locked} />
        </Field>
      </div>
      <Button size="sm" disabled={saving || locked} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </Card>
  );
}

function ScoringTab({ contest, onSaved }: { contest: Contest; onSaved: () => void }) {
  const toast = useToast();
  const [scoringMode, setScoringMode] = useState(contest.scoringMode);
  const [proctoringLevel, setProctoringLevel] = useState(contest.proctoringLevel);
  const [webcamRequired, setWebcamRequired] = useState(contest.webcamRequired);
  const [fullscreenRequired, setFullscreenRequired] = useState(contest.fullscreenRequired);
  const [webcamBonusPct, setWebcamBonusPct] = useState(String(contest.webcamBonusPct));
  const [lockdownBonusPct, setLockdownBonusPct] = useState(String(contest.lockdownBonusPct));
  const [maxStrikes, setMaxStrikes] = useState(String(contest.maxStrikes));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await hqApi(`/api/contests/${contest.id}`, {
        method: "PATCH",
        body: {
          scoringMode,
          proctoringLevel,
          webcamRequired,
          fullscreenRequired,
          webcamBonusPct: Number(webcamBonusPct),
          lockdownBonusPct: Number(lockdownBonusPct),
          maxStrikes: Number(maxStrikes),
        },
      });
      toast.toast("Saved");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 space-y-4 p-5">
      <Field label="Scoring mode">
        <Select value={scoringMode} onChange={(e) => setScoringMode(e.target.value as Contest["scoringMode"])}>
          <option value="points">Points (sum of best per-question score)</option>
          <option value="icpc_penalty">ICPC-style penalty (future work)</option>
        </Select>
      </Field>
      <Field label="Proctoring level">
        <Select
          value={proctoringLevel}
          onChange={(e) => setProctoringLevel(e.target.value as Contest["proctoringLevel"])}
        >
          <option value="none">None</option>
          <option value="basic">Basic — tab-switch detection</option>
          <option value="strict">Strict — + copy/paste blocking, fullscreen</option>
          <option value="lockdown">Lockdown — + webcam</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-on-surface">
        <input type="checkbox" checked={webcamRequired} onChange={(e) => setWebcamRequired(e.target.checked)} />
        Require webcam
      </label>
      <label className="flex items-center gap-2 text-sm text-on-surface">
        <input
          type="checkbox"
          checked={fullscreenRequired}
          onChange={(e) => setFullscreenRequired(e.target.checked)}
        />
        Require fullscreen
      </label>

      <div className="border-t border-outline-variant pt-4">
        <h3 className="text-sm font-semibold text-on-surface">Proctor-to-Earn bonuses</h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          Rating-gain multiplier bonus for participants who opt into more proctoring — applies to both gains and
          losses, so it's a genuine stakes increase, not a one-way boost.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Field label="Webcam bonus (%)">
            <Input
              type="number"
              min={0}
              max={200}
              value={webcamBonusPct}
              onChange={(e) => setWebcamBonusPct(e.target.value)}
              className="w-28"
            />
          </Field>
          <Field label="Lockdown bonus (%)">
            <Input
              type="number"
              min={0}
              max={200}
              value={lockdownBonusPct}
              onChange={(e) => setLockdownBonusPct(e.target.value)}
              className="w-28"
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-outline-variant pt-4">
        <h3 className="text-sm font-semibold text-on-surface">Proctoring strikes</h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          Crossing this many strikes auto-warns a participant; crossing 2x this many auto-disqualifies them.
        </p>
        <Field label="Max strikes" className="mt-3 w-28">
          <Input type="number" min={1} max={50} value={maxStrikes} onChange={(e) => setMaxStrikes(e.target.value)} />
        </Field>
      </div>

      <Button size="sm" disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </Card>
  );
}

interface BulkMcqItem {
  title: string;
  bodyMd: string;
  difficulty: "easy" | "medium" | "hard";
  points?: number;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
}

function QuestionsTab({ contest, onSaved }: { contest: Contest; onSaved: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkJson, setBulkJson] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);

  async function bulkImportMcqs() {
    setBulkError(null);
    let items: BulkMcqItem[];
    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Expected a non-empty JSON array");
      items = parsed as BulkMcqItem[];
      items.forEach((item, i) => {
        if (!item.title || !item.bodyMd || !item.difficulty) {
          throw new Error(`Item ${i + 1} is missing title/bodyMd/difficulty`);
        }
        if (!Array.isArray(item.options) || item.options.length < 2) {
          throw new Error(`Item ${i + 1} needs at least 2 options`);
        }
        if (!Array.isArray(item.correctOptionIds) || item.correctOptionIds.length === 0) {
          throw new Error(`Item ${i + 1} needs at least 1 correctOptionIds entry`);
        }
      });
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }

    setBulkImporting(true);
    let created = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await hqApi(`/api/contests/${contest.id}/questions`, {
          method: "POST",
          body: {
            type: "mcq",
            title: item.title,
            bodyMd: item.bodyMd,
            difficulty: item.difficulty,
            points: item.points ?? 100,
            typeConfig: {
              options: item.options,
              correctOptionIds: item.correctOptionIds,
              multiple: item.correctOptionIds.length > 1,
            },
          },
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkImporting(false);
    toast.toast(
      failed === 0 ? `Imported ${created} question${created === 1 ? "" : "s"}` : `Imported ${created}, ${failed} failed`,
      failed === 0 ? "success" : "error"
    );
    if (created > 0) {
      setBulkJson("");
      setShowBulkImport(false);
      onSaved();
    }
  }

  const [generating, setGenerating] = useState(false);
  const [genType, setGenType] = useState<QuestionType>("coding");
  const [genDifficulty, setGenDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [genTopic, setGenTopic] = useState("");
  const [draft, setDraft] = useState<AiDraft | null>(null);

  async function generate() {
    setGenerating(true);
    try {
      const res = await hqApi<{ draft: AiDraft }>(`/api/contests/${contest.id}/questions/generate`, {
        method: "POST",
        body: { type: genType, difficulty: genDifficulty, topic: genTopic },
      });
      setDraft(res.draft);
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "AI generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function addQuestion(type: QuestionType) {
    setAdding(true);
    try {
      await hqApi(`/api/contests/${contest.id}/questions`, {
        method: "POST",
        body:
          type === "coding"
            ? { type, title: "New problem", bodyMd: "Describe the problem here (markdown supported).", difficulty: "medium", points: 100, typeConfig: DEFAULT_CODING_CONFIG }
            : { type, title: "New question", bodyMd: "Write the question here (markdown supported).", difficulty: "medium", points: 100, typeConfig: DEFAULT_MCQ_CONFIG },
      });
      toast.toast("Question added");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not add question", "error");
    } finally {
      setAdding(false);
    }
  }

  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  async function removeQuestion(qid: string) {
    setBusyId(qid);
    try {
      await hqApi(`/api/contests/${contest.id}/questions/${qid}`, { method: "DELETE" });
      toast.toast("Question removed");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not remove question", "error");
    } finally {
      setBusyId(null);
      setConfirmingRemoveId(null);
    }
  }

  // Drag-and-drop reordering (BUG-7) — native HTML5 drag events, no added
  // dependency for what's a plain list-reorder.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...contest.questions];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setReordering(true);
    try {
      await hqApi(`/api/contests/${contest.id}/questions/reorder`, {
        method: "PATCH",
        body: { order: reordered.map((q) => q.id) },
      });
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not reorder questions", "error");
    } finally {
      setReordering(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setAdding(true);
    try {
      await hqApi(`/api/contests/${contest.id}/questions`, {
        method: "POST",
        body: { type: draft.type, title: draft.title, bodyMd: draft.bodyMd, difficulty: draft.difficulty, points: 100, typeConfig: draft.typeConfig },
      });
      toast.toast("Question saved");
      setDraft(null);
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save question", "error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <Card className="space-y-3 border border-accent/30 bg-accent/5 p-5">
        <h3 className="text-sm font-semibold text-on-surface">Generate with AI</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Type">
            <Select value={genType} onChange={(e) => setGenType(e.target.value as QuestionType)}>
              <option value="coding">Coding</option>
              <option value="mcq">MCQ</option>
            </Select>
          </Field>
          <Field label="Difficulty">
            <Select value={genDifficulty} onChange={(e) => setGenDifficulty(e.target.value as "easy" | "medium" | "hard")}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field label="Topic (optional)" className="min-w-56 flex-1">
            <Input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="e.g. graph traversal, hash maps" />
          </Field>
          <Button size="sm" disabled={generating} onClick={generate}>
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
      </Card>

      {draft ? (
        <DraftQuestionCard draft={draft} onChange={setDraft} onSave={saveDraft} onDiscard={() => setDraft(null)} saving={adding} />
      ) : null}

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-on-surface">Import MCQs (JSON)</h3>
          <Button size="sm" variant="secondary" onClick={() => setShowBulkImport((v) => !v)}>
            {showBulkImport ? "Hide" : "Import MCQs"}
          </Button>
        </div>
        {showBulkImport ? (
          <>
            <p className="text-xs text-on-surface-variant">
              Paste a JSON array: {'[{ "title", "bodyMd", "difficulty", "options": [{ "id", "text" }], "correctOptionIds": [...] }]'}
            </p>
            <Textarea
              rows={8}
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              className="font-mono text-xs"
              placeholder="[ { ... } ]"
            />
            {bulkError ? <ErrorNote message={bulkError} /> : null}
            <Button size="sm" disabled={bulkImporting || !bulkJson.trim()} onClick={bulkImportMcqs}>
              {bulkImporting ? "Importing…" : "Import"}
            </Button>
          </>
        ) : null}
      </Card>

      {contest.questions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-on-surface-variant">
          No questions yet. Add at least one problem before publishing.
        </Card>
      ) : (
        <>
          {reordering ? <p className="text-xs text-on-surface-variant">Saving new order…</p> : null}
          {contest.questions.map((q, i) => (
            <div
              key={q.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={dragIndex === i ? "opacity-50" : undefined}
            >
              <QuestionEditor
                contestId={contest.id}
                question={q}
                busy={busyId === q.id}
                onSaved={onSaved}
                onRemove={() => setConfirmingRemoveId(q.id)}
                onDragHandleStart={() => setDragIndex(i)}
              />
            </div>
          ))}
        </>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={adding} onClick={() => addQuestion("coding")}>
          {adding ? "Adding…" : "+ Add coding question"}
        </Button>
        <Button size="sm" variant="secondary" disabled={adding} onClick={() => addQuestion("mcq")}>
          {adding ? "Adding…" : "+ Add MCQ question"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingRemoveId !== null}
        title="Remove this question?"
        body="This permanently deletes the question from the contest. This cannot be undone."
        confirmLabel="Remove"
        danger
        busy={busyId === confirmingRemoveId}
        onConfirm={() => confirmingRemoveId && removeQuestion(confirmingRemoveId)}
        onCancel={() => setConfirmingRemoveId(null)}
      />
    </div>
  );
}

function DraftQuestionCard({
  draft,
  onChange,
  onSave,
  onDiscard,
  saving,
}: {
  draft: AiDraft;
  onChange: (d: AiDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const codingConfig = draft.type === "coding" ? (draft.typeConfig as CodingConfig) : null;
  const mcqConfig = draft.type === "mcq" ? (draft.typeConfig as McqConfig) : null;
  const configError = codingConfig ? validateCodingConfig(codingConfig) : mcqConfig ? validateMcqConfig(mcqConfig) : null;

  return (
    <Card className="space-y-3 border border-accent/30 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">AI draft — review before saving</span>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
      <Field label="Title">
        <Input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </Field>
      <MarkdownField label="Problem statement" value={draft.bodyMd} onChange={(v) => onChange({ ...draft, bodyMd: v })} />
      {codingConfig ? (
        <CodingSettingsPanel config={codingConfig} onChange={(cfg) => onChange({ ...draft, typeConfig: cfg })} />
      ) : mcqConfig ? (
        <McqOptionBuilder config={mcqConfig} onChange={(cfg) => onChange({ ...draft, typeConfig: cfg })} />
      ) : null}
      {configError ? <ErrorNote message={configError} /> : null}
      <Button size="sm" disabled={saving || Boolean(configError)} onClick={onSave}>
        {saving ? "Saving…" : "Save this question"}
      </Button>
    </Card>
  );
}

function QuestionEditor({
  contestId,
  question,
  busy,
  onSaved,
  onRemove,
  onDragHandleStart,
}: {
  contestId: string;
  question: ContestQuestion;
  busy: boolean;
  onSaved: () => void;
  onRemove: () => void;
  onDragHandleStart: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<QuestionType>(question.type ?? "coding");
  const [title, setTitle] = useState(question.title);
  const [bodyMd, setBodyMd] = useState(question.bodyMd);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [points, setPoints] = useState(String(question.points));
  const [editorial, setEditorial] = useState(question.editorial ?? "");
  const [codingConfig, setCodingConfig] = useState<CodingConfig>(
    question.type === "coding" ? { ...DEFAULT_CODING_CONFIG, ...(question.typeConfig as object) } : DEFAULT_CODING_CONFIG
  );
  const [mcqConfig, setMcqConfig] = useState<McqConfig>(
    question.type === "mcq" ? { ...DEFAULT_MCQ_CONFIG, ...(question.typeConfig as object) } : DEFAULT_MCQ_CONFIG
  );
  const [saving, setSaving] = useState(false);

  const configError = type === "coding" ? validateCodingConfig(codingConfig) : validateMcqConfig(mcqConfig);

  function switchType(next: QuestionType) {
    setType(next);
  }

  async function save() {
    if (configError) return;
    setSaving(true);
    try {
      await hqApi(`/api/contests/${contestId}/questions/${question.id}`, {
        method: "PATCH",
        body: {
          type,
          title,
          bodyMd,
          difficulty,
          points: Number(points),
          typeConfig: type === "coding" ? codingConfig : mcqConfig,
          editorial: editorial.trim(),
        },
      });
      toast.toast("Question saved");
      onSaved();
    } catch (err) {
      toast.toast(err instanceof ApiError ? err.message : "Could not save question", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            draggable
            onDragStart={onDragHandleStart}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            className="cursor-grab select-none px-1 text-on-surface-variant active:cursor-grabbing"
          >
            ⠿
          </span>
          <span className="text-xs font-medium text-on-surface-variant">
            #{question.seq} · {type === "mcq" ? "MCQ" : "Coding"}
          </span>
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Field label="Type">
        <Select value={type} onChange={(e) => switchType(e.target.value as QuestionType)}>
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
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as ContestQuestion["difficulty"])}>
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

      <MarkdownField label="Solution / editorial (optional — shown publicly once the contest is completed)" value={editorial} onChange={setEditorial} rows={5} />

      <Button size="sm" disabled={saving || Boolean(configError)} onClick={save}>
        {saving ? "Saving…" : "Save question"}
      </Button>
    </Card>
  );
}
