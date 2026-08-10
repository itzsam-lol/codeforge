import { HeroSection } from "@/components/hero/HeroSection";
import { WhySelfHostedSection } from "@/components/sections/WhySelfHostedSection";
import { AssessmentShowcase } from "@/components/sections/AssessmentShowcase";
import { LanguagesMarquee } from "@/components/sections/LanguagesMarquee";
import { SecuritySection } from "@/components/sections/SecuritySection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/footer/Footer";

export default function Home() {
  return (
    <>
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
