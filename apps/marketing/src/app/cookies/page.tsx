import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";

const TITLE = "Cookie Policy";
const DESCRIPTION = "What CodeForge's marketing site stores in your browser, and why.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <a href="/" aria-label="CodeForge home" className="flex items-center">
          <Wordmark dark={false} />
        </a>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-medium text-accent">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Cookie Policy</h1>
        <p className="mt-3 text-[15px] text-slate-500">Last updated August 2026</p>

        <Section title="The short version">
          <p>
            This site does not run ad or analytics trackers of any kind. There is no third-party
            pixel, no behavioral profiling, and nothing sold or shared about your visit.
          </p>
        </Section>

        <Section title="What we actually store">
          <p>
            One item, in your browser&apos;s local storage rather than a cookie: a flag remembering
            whether you accepted or dismissed the cookie notice, so it doesn&apos;t reappear on your
            next visit. It contains no personal data and isn&apos;t sent to our servers.
          </p>
          <p>
            The chat assistant on this site keeps its conversation in memory for your current tab
            only — it isn&apos;t persisted to storage or a cookie, and it clears when you close or
            reload the page.
          </p>
        </Section>

        <Section title="The contact form">
          <p>
            Submitting the contact form sends its contents directly to our servers over the
            request itself, not via a cookie. See our{" "}
            <a href="/privacy" className="font-medium text-accent hover:text-accent-hover">
              Privacy Policy
            </a>{" "}
            for what happens to that data.
          </p>
        </Section>

        <Section title="If this ever changes">
          <p>
            If we introduce analytics or any other tracking in the future, this page will be
            updated first to describe exactly what&apos;s added and why, and the cookie notice will
            ask again rather than carrying forward a prior acceptance.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Reach us at{" "}
            <a href="mailto:support@codeforge.io" className="font-medium text-accent hover:text-accent-hover">
              support@codeforge.io
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
