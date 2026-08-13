import type { Metadata } from "next";

const TITLE = "Contact";
const DESCRIPTION = "Get in touch with CodeForge for a demo or a sales conversation about self-hosted technical assessments.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
