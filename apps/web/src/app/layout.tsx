import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

interface PublicBranding {
  name: string;
  tagline?: string;
  faviconUrl?: string;
}

async function fetchPublicBranding(): Promise<PublicBranding> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/org/public`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return { name: "CodeForge" };
  }
}

/**
 * White-label chrome: the browser tab title and favicon come from the
 * deployment's own org branding (fetched server-side, so it's correct on
 * first paint, not a client-side flash of the CodeForge default). CodeForge
 * ships one org per deployment (self-hosted per client), so there's no
 * ambiguity about "which org" here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await fetchPublicBranding();
  const title = branding.tagline ? `${branding.name}: ${branding.tagline}` : branding.name;
  return {
    title,
    description: "Technical assessment platform for app-development hiring",
    icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
