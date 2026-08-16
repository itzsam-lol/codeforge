import { HeroSection } from "@/components/hero/HeroSection";
import { WhySelfHostedSection } from "@/components/sections/WhySelfHostedSection";
import { AssessmentShowcase } from "@/components/sections/AssessmentShowcase";
import { LanguagesMarquee } from "@/components/sections/LanguagesMarquee";
import { SecuritySection } from "@/components/sections/SecuritySection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { faqs } from "@/data/faqs";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/footer/Footer";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection />
      <WhySelfHostedSection />
      <AssessmentShowcase />
      <LanguagesMarquee />
      <SecuritySection />
      <FeaturesSection />
      <HowItWorksSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </>
  );
}
