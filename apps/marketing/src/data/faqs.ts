/**
 * Plain data, deliberately its own module rather than a named export from
 * FAQSection.tsx: that file is "use client", and page.tsx (a Server
 * Component) importing a plain data export across that boundary resolved to
 * something that wasn't the real array once the build moved to Turbopack
 * (Next 16) - `faqs.map is not a function` at build time. A Server
 * Component and a Client Component should each import shared data from a
 * plain module, not from one another.
 */
export const faqs = [
  {
    q: "Where does the platform actually run?",
    a: "On infrastructure you control. CodeForge ships as one self-hosted deployment per client, with its own database, object storage, and domain. It is not a shared multi-tenant SaaS, so your data never sits alongside another company's.",
  },
  {
    q: "How is candidate code executed safely?",
    a: "Submissions run in a sandboxed execution runtime with network access disabled by default. Repo-project grading runs in an isolated pipeline behind an egress allowlist, so untrusted candidate code cannot reach the open internet or your internal services.",
  },
  {
    q: "Can we fully white-label it?",
    a: "Yes. Logo, accent color, display name, favicon, and support contact are configured once and applied across the recruiter dashboard and the entire candidate flow. A single toggle hides every trace of CodeForge branding so it reads as your own product.",
  },
  {
    q: "Which languages are supported for coding questions?",
    a: "JavaScript, TypeScript, Python, C++, C, Java, C#, and Go, each with its own sandbox configuration. MCQ, frontend, bug-fix, API, and repo-project types layer on top of that for full engineering coverage.",
  },
  {
    q: "How do you handle integrity and proctoring?",
    a: "Configurable tab-switch and fullscreen enforcement, webcam checks, keystroke replay, and a plagiarism engine that compares submissions against a per-question corpus. Every proctoring behavior is disclosed to candidates up front, by design.",
  },
  {
    q: "Is there a signup or billing flow?",
    a: "No. Onboarding is a provisioning and configuration process we run with you, not a self-serve checkout. Commercial terms are handled per client rather than enforced inside the running application.",
  },
];
