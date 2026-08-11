import { Reveal } from "@/components/Reveal";

const languages = [
  "JavaScript",
  "TypeScript",
  "Python",
  "C++",
  "C",
  "Java",
  "C#",
  "Go",
];

export function LanguagesMarquee() {
  // Duplicated once so the -50% translate loops seamlessly.
  const items = [...languages, ...languages];

  return (
    <section className="border-y border-slate-200 bg-slate-50 py-14">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Eight languages, sandboxed and grading-ready out of the box
          </p>
        </Reveal>
      </div>
      <div className="cf-fade-mask-x relative mt-8 overflow-hidden">
        <div className="cf-marquee flex w-max gap-4">
          {items.map((lang, i) => (
            <span
              key={i}
              className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 py-2.5 font-mono text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.10)]"
            >
              <span className="size-2 rounded-full bg-accent/60" />
              {lang}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
