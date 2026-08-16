import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";

const TITLE = "Terms of Use";
const DESCRIPTION = "The terms governing your use of this website.";

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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <a href="/" aria-label="CodeForge home" className="flex items-center">
          <Wordmark dark={false} />
        </a>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-medium text-accent">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Terms of Use</h1>
        <p className="mt-3 text-[15px] text-slate-500">Last updated August 2026</p>

        <p className="mt-8 rounded-lg bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-900">
          These Terms govern your use of <strong>this website</strong> (codeforge.io and its
          subpages) only. They are not a software license, subscription agreement, or SLA. If
          you&apos;re evaluating or using the CodeForge assessment platform itself, that
          relationship is governed by a separate written agreement executed directly between
          CodeForge AI Systems and your organization — see{" "}
          <a href="#the-software" className="font-medium text-accent hover:text-accent-hover">
            &ldquo;The software itself&rdquo;
          </a>{" "}
          below.
        </p>

        <Section title="Who we are">
          <p>
            This site is operated by CodeForge AI Systems (&ldquo;CodeForge,&rdquo;
            &ldquo;we,&rdquo; &ldquo;us&rdquo;). By browsing this website or submitting the
            contact form, you agree to these Terms. If you don&apos;t agree, please don&apos;t use
            the site — email us instead at{" "}
            <a href="mailto:support@codeforge.io" className="font-medium text-accent hover:text-accent-hover">
              support@codeforge.io
            </a>
            .
          </p>
        </Section>

        <Section title="Using this site">
          <p>
            You may browse this website and submit the contact form for legitimate business
            inquiries about the CodeForge platform. You agree not to: submit false or misleading
            information through the contact form; attempt to probe, scan, or interfere with the
            site&apos;s infrastructure; scrape or systematically extract content for a competing
            product; or use the site in any way that violates applicable law.
          </p>
        </Section>

        <Section title="Content and intellectual property">
          <p>
            The text, design, graphics, and branding on this site belong to CodeForge AI Systems
            or are used with permission. You may view and share pages of this site for their
            intended purpose (evaluating CodeForge as a vendor); you may not reproduce, modify, or
            redistribute the site&apos;s content for another commercial purpose without our
            written consent.
          </p>
        </Section>

        <Section title="No warranty on site content">
          <p>
            Marketing content — feature descriptions, pricing framing, comparisons — is provided
            for general informational purposes and kept as accurate as we can make it, but isn&apos;t
            a binding specification of the product. The actual scope, features, and commitments
            for any deployment are defined in your organization&apos;s written agreement with us,
            not by anything on this website.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            This website and its content are provided &ldquo;as is,&rdquo; without warranties of
            any kind. To the fullest extent permitted by law, CodeForge AI Systems is not liable
            for any damages arising from your use of, or inability to use, this website. This
            section does not limit any liability arising under a separate written agreement
            covering the actual software.
          </p>
        </Section>

        <Section title="Changes to these Terms">
          <p>
            We may update these Terms from time to time; the &ldquo;Last updated&rdquo; date
            above will reflect the most recent revision. Continued use of the site after a change
            means you accept the updated Terms.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These Terms are governed by the laws of the jurisdiction in which CodeForge AI
            Systems is incorporated, without regard to conflict-of-law principles.
          </p>
        </Section>

        <Section title="The software itself">
          <p id="the-software">
            CodeForge is not sold as self-serve SaaS — there&apos;s no signup flow, and nothing on
            this website creates a license to use the assessment platform. Every deployment is
            provisioned directly with our team, and the terms covering that relationship
            (licensing, data processing, support, pricing, term, and termination) are set out in
            a separate written agreement signed with your organization, not these Terms of Use.
            If you don&apos;t have that agreement yet and want one,{" "}
            <a href="/contact" className="font-medium text-accent hover:text-accent-hover">
              get in touch
            </a>
            .
          </p>
          <p>
            For how the platform itself handles your candidates&apos; data once deployed, see{" "}
            <a href="/#why-self-hosted" className="font-medium text-accent hover:text-accent-hover">
              why we self-host
            </a>{" "}
            — data processing terms for your deployment are part of your organization&apos;s
            written agreement, not this page.
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
