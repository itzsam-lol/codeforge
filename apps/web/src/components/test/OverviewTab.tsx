"use client";

import { useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import type { TestDetail } from "./types";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from "../ui";
import { fmtDateTime } from "@/lib/format";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OverviewTab({ test, onChanged }: { test: TestDetail; onChanged: () => void }) {
  const [title, setTitle] = useState(test.title);
  const [description, setDescription] = useState(test.description);
  const [duration, setDuration] = useState(String(test.durationMinutes));
  const [proctoring, setProctoring] = useState(test.proctoringLevel);
  const [start, setStart] = useState(toLocalInput(test.schedulingStart));
  const [end, setEnd] = useState(toLocalInput(test.schedulingEnd));
  const [shuffle, setShuffle] = useState(Boolean(test.settings.shuffleQuestions));
  const [partialCredit, setPartialCredit] = useState(test.settings.partialCredit !== false);
  const [msqPartial, setMsqPartial] = useState(Boolean(test.settings.msqPartialCredit));
  const [instructions, setInstructions] = useState(test.settings.instructionsMd ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState(false);

  const editable = test.status !== "archived";
  const willAutoPublish =
    test.status === "draft" && test.schedulingStart != null && new Date(test.schedulingStart) > new Date();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/tests/${test.id}`, {
        method: "PUT",
        body: {
          title,
          description,
          durationMinutes: Number(duration),
          proctoringLevel: proctoring,
          schedulingStart: start ? new Date(start).toISOString() : null,
          schedulingEnd: end ? new Date(end).toISOString() : null,
          settings: {
            shuffleQuestions: shuffle,
            partialCredit,
            msqPartialCredit: msqPartial,
            allowedLanguages: test.settings.allowedLanguages ?? [],
            instructionsMd: instructions,
          },
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "publish" | "close") {
    setTransitionBusy(true);
    setError(null);
    try {
      await staffApi(`/api/tests/${test.id}/${action}`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${action}`);
    } finally {
      setTransitionBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="space-y-4 p-5">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Description (internal)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} />
        </Field>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Duration (min)">
            <Input type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Proctoring" hint="Levels beyond 'none' activate in Phase 2">
            <Select value={proctoring} onChange={(e) => setProctoring(e.target.value)} disabled={!editable}>
              <option value="none">None</option>
              <option value="basic">Basic</option>
              <option value="strict">Strict</option>
              <option value="lockdown">Lockdown</option>
            </Select>
          </Field>
          <Field label="Window opens">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Window closes">
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!editable} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-on-surface">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} disabled={!editable} />
            Shuffle question order per candidate
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={partialCredit} onChange={(e) => setPartialCredit(e.target.checked)} disabled={!editable} />
            Partial credit on coding questions
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={msqPartial} onChange={(e) => setMsqPartial(e.target.checked)} disabled={!editable} />
            Partial credit on MSQs
          </label>
        </div>
        <Field label="Instructions page (Markdown, shown before the timer starts)">
          <Textarea rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={!editable} />
        </Field>
        {error ? <ErrorNote message={error} /> : null}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {test.status === "draft" ? (
              <Button variant="secondary" disabled={transitionBusy} onClick={() => transition("publish")}>
                {transitionBusy ? "Publishing…" : "Publish"}
              </Button>
            ) : null}
            {test.status === "published" ? (
              <Button variant="secondary" disabled={transitionBusy} onClick={() => transition("close")}>
                {transitionBusy ? "Closing…" : "Close test"}
              </Button>
            ) : null}
            {willAutoPublish ? (
              <span className="text-xs text-on-surface-variant">
                Will publish automatically on {fmtDateTime(test.schedulingStart)}
              </span>
            ) : null}
          </div>
          <Button onClick={save} disabled={busy || !editable}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
