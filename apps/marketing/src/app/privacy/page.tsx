import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";

const TITLE = "Privacy Policy";
const DESCRIPTION = "What information CodeForge's marketing site collects and how it's used.";

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

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <a href="/" aria-label="CodeForge home" className="flex items-center">
          <Wordmark dark={false} />
        </a>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-medium text-accent">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-3 text-[15px] text-slate-500">Last updated August 2026</p>

        <Section title="What this site collects">
          <p>
            This marketing site collects information only when you submit the contact form:
            your name, work email, company, team size, what you&apos;re evaluating, and any
            message you add. Nothing is collected passively - there&apos;s no analytics or
            tracking pixel running in the background (see our{" "}
            <a href="/cookies" className="font-medium text-accent hover:text-accent-hover">
              Cookie Policy
            </a>
            ).
          </p>
        </Section>

        <Section title="How it's used">
          <p>
            Contact-form submissions are used for exactly one purpose: getting back to you about
            a demo or sales inquiry. A submission is emailed to our sales team and, where our
            internal systems are connected, logged in our own CRM so the right person follows up.
            It is never sold, rented, or shared with third-party advertisers.
          </p>
        </Section>

        <Section title="Where it's stored">
          <p>
            Submissions are delivered directly to CodeForge&apos;s own infrastructure and email
            provider. They are not retained by any third-party marketing or analytics platform,
            because none is in use on this site.
          </p>
        </Section>

        <Section title="The product itself">
          <p>
            This policy covers the marketing website only. Once you&apos;re a CodeForge customer,
            your candidates&apos; data (submissions, proctoring events, results) lives entirely in
            your own self-hosted deployment - CodeForge does not have standing access to it. See{" "}
            <a href="/#why-self-hosted" className="font-medium text-accent hover:text-accent-hover">
              why we self-host
            </a>{" "}
            for more.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can ask us to delete a contact-form submission at any time by emailing us with
            the email address you submitted it from. We&apos;ll confirm once it&apos;s removed
            from our inbox and CRM.
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
