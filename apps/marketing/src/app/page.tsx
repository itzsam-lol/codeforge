import { HeroSection } from "@/components/hero/HeroSection";
import { WhySelfHostedSection } from "@/components/sections/WhySelfHostedSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/footer/Footer";

export default function Home() {
  return (
    <>
      <HeroSection />
      <WhySelfHostedSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </>
  );
}
