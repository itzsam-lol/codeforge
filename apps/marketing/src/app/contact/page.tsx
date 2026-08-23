"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";

const TEAM_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const FOCUS_AREAS = [
  "DSA / coding screens",
  "Frontend UI challenges",
  "Full app-dev round (multiple types)",
  "Proctoring / integrity",
  "Not sure yet",
];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-accent";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export default function ContactPage() {
  const [intent, setIntent] = useState<"demo" | "sales">("demo");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  // Read the query string after mount rather than during render so the
  // server-rendered HTML and the client's first render always match
  // ("demo"), avoiding a hydration mismatch. This runs one tick after
  // hydration, which is fine for a non-critical pre-selected toggle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intent") === "sales") setIntent("sales");
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = new FormData(e.currentTarget);
    const body = {
      intent,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      company: String(form.get("company") ?? ""),
      teamSize: String(form.get("teamSize") ?? ""),
      focus: String(form.get("focus") ?? ""),
      message: String(form.get("message") ?? ""),
    };
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-slate-900">Message received</h1>
          <p className="mt-2 text-slate-600">
            Thanks for reaching out. We respond to every {intent === "demo" ? "demo request" : "inquiry"} within
            one business day.
          </p>
          <a href="/" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover">
            <ArrowLeft className="size-4" />
            Back to home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-lg flex-col px-6 py-12">
        <div className="flex items-center justify-between">
          <a href="/" aria-label="CodeForge home">
            <Wordmark dark={false} />
          </a>
          <a href="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="size-3.5" />
            Back
          </a>
        </div>

        <div className="mt-10">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setIntent("demo")}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                intent === "demo" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Book a demo
            </button>
            <button
              type="button"
              onClick={() => setIntent("sales")}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                intent === "sales" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Talk to sales
            </button>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
            {intent === "demo" ? "See CodeForge on your own infrastructure" : "Talk to our team"}
          </h1>
          <p className="mt-2 text-slate-600">
            {intent === "demo"
              ? "A 30-minute walkthrough tailored to your hiring process, your stack, and your brand."
              : "Questions about deployment, pricing, or security - we usually reply the same day."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <input id="name" name="name" required maxLength={200} className={inputClass} placeholder="Jordan Lee" />
            </Field>
            <Field label="Work email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={320}
                className={inputClass}
                placeholder="jordan@company.com"
              />
            </Field>
          </div>

          <Field label="Company" htmlFor="company">
            <input id="company" name="company" required maxLength={200} className={inputClass} placeholder="Company name" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Team size" htmlFor="teamSize">
              <select id="teamSize" name="teamSize" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select
                </option>
                {TEAM_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What are you evaluating" htmlFor="focus">
              <select id="focus" name="focus" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select
                </option>
                {FOCUS_AREAS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Anything else we should know (optional)" htmlFor="message">
            <textarea
              id="message"
              name="message"
              rows={4}
              maxLength={2000}
              className={`${inputClass} resize-none`}
              placeholder="Current hiring volume, timeline, specific requirements..."
            />
          </Field>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <Button
            type="submit"
            size="lg"
            disabled={status === "submitting"}
            className="w-full disabled:opacity-60"
          >
            {status === "submitting" ? "Sending..." : intent === "demo" ? "Request a demo" : "Send message"}
          </Button>

          <p className="text-center text-xs text-slate-400">
            No self-serve signup. Every deployment is set up and configured with you.
          </p>
        </form>
      </div>
    </main>
  );
}
