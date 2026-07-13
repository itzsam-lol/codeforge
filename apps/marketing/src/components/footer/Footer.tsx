import { Wordmark } from "@/components/Wordmark";

const links = [
  { name: "Features", href: "#features" },
  { name: "Why Self-Hosted", href: "#why-self-hosted" },
  { name: "How It Works", href: "#how-it-works" },
  { name: "Contact", href: "#contact" },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <Wordmark />
          <p className="mt-2 text-sm text-slate-500">
            Self-hosted, white-label technical assessments.
          </p>
        </div>

        <ul className="flex flex-wrap justify-center gap-6 text-sm text-slate-600">
          {links.map((l) => (
            <li key={l.name}>
              <a href={l.href} className="hover:text-slate-900">
                {l.name}
              </a>
            </li>
          ))}
        </ul>

        <div className="text-sm text-slate-500">
          <a href="mailto:support@codeforge.io" className="hover:text-slate-900">
            support@codeforge.io
          </a>
          <p className="mt-1">© {new Date().getFullYear()} CodeForge AI Systems</p>
        </div>
      </div>
    </footer>
  );
}
