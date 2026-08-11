import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { ChatWidget } from "@/components/ChatWidget";
import { CookieConsent } from "@/components/CookieConsent";
import "./globals.css";

// Self-hosted the same way Geist was: the actual variable-weight file (Google's
// own public Google Fonts release, latin subset) baked in at build time, no
// runtime request. next/font/google's bundled snapshot doesn't list this
// family yet, hence next/font/local instead of the google import.
const googleSans = localFont({
  src: "../fonts/GoogleSansFlex.woff2",
  variable: "--font-primary",
  weight: "300 800",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://codeforge.io";
const TITLE = "CodeForge: self-hosted technical assessments";
const DESCRIPTION =
  "Self-hosted, white-label technical assessment platform. DSA, MCQ, frontend UI, bug fix, API and repo challenges, deployed in your own infrastructure.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · CodeForge" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CodeForge",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport = {
  themeColor: "#05070f",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CodeForge",
  url: SITE_URL,
  description: DESCRIPTION,
  email: "support@codeforge.io",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${googleSans.variable} ${geistMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        <ChatWidget />
        <CookieConsent />
      </body>
    </html>
  );
}
