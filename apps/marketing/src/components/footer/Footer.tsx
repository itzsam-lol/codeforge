import { Wordmark } from "@/components/Wordmark";

const columns = [
  {
    title: "Product",
    links: [
      { name: "Assessment types", href: "#assessments" },
      { name: "Capabilities", href: "#features" },
      { name: "Security", href: "#security" },
      { name: "How it works", href: "#how-it-works" },
      { name: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "Why self-hosted", href: "#why-self-hosted" },
      { name: "FAQ", href: "#faq" },
      { name: "Book a demo", href: "/contact?intent=demo" },
      { name: "Contact sales", href: "/contact?intent=sales" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#05070f]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Wordmark dark />
            <p className="mt-4 max-w-xs text-base leading-relaxed text-slate-300">
              Self-hosted, white-label technical assessments. Your candidate data stays in your
              own infrastructure, start to finish.
            </p>
            <a
              href="mailto:support@codeforge.io"
              className="mt-4 inline-block text-base font-medium text-accent-soft hover:text-white"
            >
              support@codeforge.io
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3.5 text-base">
                {col.links.map((l) => (
                  <li key={l.name}>
                    <a href={l.href} className="text-slate-300 transition-colors hover:text-white">
                      {l.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-sm text-slate-400 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} CodeForge AI Systems. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="/terms" className="transition-colors hover:text-white">
              Terms of Use
            </a>
            <a href="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </a>
            <a href="/cookies" className="transition-colors hover:text-white">
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
