import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section id="contact" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div className="cf-hero-mesh rounded-3xl px-8 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            See CodeForge running on your own infrastructure
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
            Book a short demo and we will walk through a deployment tailored to your hiring process.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="mailto:support@codeforge.io?subject=Book%20a%20demo" size="lg">
              Book a demo
            </Button>
            <Button
              href="mailto:support@codeforge.io?subject=Contact%20sales"
              variant="ghost"
              size="lg"
              className="text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Contact sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
