"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button, ErrorNote, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { candidateApi, ApiError } from "@/lib/api";

/**
 * Reachable from every phase of the candidate flow (pre-test, mid-exam, and
 * the done screen — see t/[token]/page.tsx and TestRunner.tsx), built the
 * same way PracticeModal wraps Modal so it's a same-page overlay: never a
 * new tab/window, never touches document.fullscreenElement, so it can't
 * trip the tab-switch/fullscreen-exit proctoring detectors even mid-exam.
 *
 * Resilience: the supportEmail mailto link is always shown alongside the
 * form, not only on failure — even a total backend outage still leaves a
 * working manual escape hatch that depends on nothing from this component.
 */
export function GetHelpModal({
  open,
  onClose,
  token,
  supportEmail,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  supportEmail: string | null;
}) {
  const [channel, setChannel] = useState<"org" | "codeforge">("org");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    setSubject("");
    setBody("");
    setError(null);
    setSent(false);
    setChannel("org");
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await candidateApi(token, "/api/candidate/support", {
        method: "POST",
        body: { channel, subject: subject.trim() || "Help request", body: body.trim() },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that — try the email link below instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Get help">
      {sent ? (
        <div className="space-y-3">
          <p className="text-sm text-on-surface">
            Sent. {channel === "org" ? "The hiring team" : "CodeForge"} will follow up by email.
          </p>
          <Button variant="secondary" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="What's this about?">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as "org" | "codeforge")}>
              <option value="org">A question about this test or the role</option>
              <option value="codeforge">Something's broken — a technical problem</option>
            </Select>
          </Field>
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={channel === "org" ? "Question about the test" : "e.g. Webcam won't start"}
            />
          </Field>
          <Field label="Message">
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              placeholder="Describe what's happening…"
            />
          </Field>
          {error ? <ErrorNote message={error} /> : null}
          <Button className="w-full" disabled={busy || !body.trim()} onClick={submit}>
            {busy ? "Sending…" : "Send"}
          </Button>
          {supportEmail ? (
            <p className={cn("text-center text-xs text-on-surface-variant")}>
              Prefer email? Reach us directly at{" "}
              <a href={`mailto:${supportEmail}`} className="font-medium text-accent hover:underline">
                {supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
