"use client";

import { useEffect, useState } from "react";
import { staffApi, ApiError } from "@/lib/api";
import { Button, Card, ErrorNote, Field, Input, Spinner } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";

interface Branding {
  displayName?: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  supportEmail?: string;
  privacyUrl?: string;
  hideCodeForgeBranding?: boolean;
}

interface OrgPayload {
  org: { id: string; name: string; branding: Branding };
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const [org, setOrg] = useState<OrgPayload["org"] | null>(null);
  const [form, setForm] = useState<Branding>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffApi<OrgPayload>("/api/org").then((d) => {
      setOrg(d.org);
      setForm(d.org.branding);
    });
  }, []);

  if (!org) return <Spinner />;

  function set<K extends keyof Branding>(key: K, value: Branding[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Branding = {};
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === "string" && v.trim()) (body as Record<string, unknown>)[k] = v.trim();
        else if (typeof v === "boolean") (body as Record<string, unknown>)[k] = v;
      }
      const d = await staffApi<OrgPayload>("/api/org", { method: "PUT", body });
      setOrg(d.org);
      setForm(d.org.branding);
      setNotice("Saved. The recruiter dashboard, login page, and candidate flow all pick this up immediately.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const previewBranding = {
    name: form.displayName || org.name,
    tagline: form.tagline,
    logoUrl: form.logoUrl,
    accentColor: form.accentColor,
    hideCodeForgeBranding: form.hideCodeForgeBranding ?? false,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-sm text-slate-500">
        CodeForge is deployed one organization per install, so everything here rebrands the whole
        product for this deployment: the recruiter dashboard and login page, and the entire
        candidate-facing flow.
      </p>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Preview</h3>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
          <div className="flex flex-col gap-0.5">
            <Wordmark branding={previewBranding} />
            {previewBranding.tagline ? (
              <span className="text-xs text-slate-500">{previewBranding.tagline}</span>
            ) : null}
          </div>
          <button
            className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm"
            style={{ backgroundColor: form.accentColor && HEX_RE.test(form.accentColor) ? form.accentColor : "#4f46e5" }}
          >
            Sample button
          </button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Identity</h3>
        <Field label="Display name" hint="Defaults to the organization name">
          <Input value={form.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} placeholder={org.name} />
        </Field>
        <Field label="Tagline" hint="Short line under the name, e.g. “Engineering Careers”">
          <Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Technical assessments" />
        </Field>
        <Field label="Logo URL" hint="A hosted image URL (SVG or PNG recommended, light background)">
          <Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://example.com/logo.svg" />
        </Field>
        <Field label="Favicon URL" hint="Browser tab icon; falls back to the CodeForge default">
          <Input value={form.faviconUrl ?? ""} onChange={(e) => set("faviconUrl", e.target.value)} placeholder="https://example.com/favicon.png" />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Color</h3>
        <Field label="Accent color" hint="6-digit hex, used on primary buttons and links across the candidate flow">
          <div className="flex items-center gap-2">
            <Input value={form.accentColor ?? ""} onChange={(e) => set("accentColor", e.target.value)} placeholder="#4f46e5" className="w-40" />
            {form.accentColor && HEX_RE.test(form.accentColor) ? (
              <span className="h-8 w-8 rounded-lg shadow-[var(--shadow-card)]" style={{ backgroundColor: form.accentColor }} />
            ) : null}
          </div>
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Contact &amp; links</h3>
        <Field label="Support email" hint="Shown to candidates who hit a problem with their link">
          <Input type="email" value={form.supportEmail ?? ""} onChange={(e) => set("supportEmail", e.target.value)} placeholder="hiring@example.com" />
        </Field>
        <Field label="Privacy policy URL" hint="Optional; linked from candidate-facing pages">
          <Input value={form.privacyUrl ?? ""} onChange={(e) => set("privacyUrl", e.target.value)} placeholder="https://example.com/privacy" />
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">White-label</h3>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.hideCodeForgeBranding ?? false}
            onChange={(e) => set("hideCodeForgeBranding", e.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-800">Hide all CodeForge branding</span>
            <p className="mt-0.5 text-xs text-slate-500">
              Suppresses the &quot;Powered by CodeForge&quot; line and the default CodeForge wordmark
              fallback everywhere (candidate pages, login, dashboard sidebar). Turn this on once
              you&apos;ve set a display name and logo above, so the product only ever shows your
              own brand.
            </p>
          </span>
        </label>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p> : null}
      <div className="flex justify-end pb-4">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save branding"}
        </Button>
      </div>
    </div>
  );
}
