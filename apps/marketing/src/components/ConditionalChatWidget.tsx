"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/ChatWidget";

/** Suppresses the floating chat bubble on every /arena/* route — it's
 *  distracting during a timed contest and, worse, a potential side channel
 *  for communicating answers (BUG-5). */
export function ConditionalChatWidget() {
  const pathname = usePathname();
  if (pathname?.startsWith("/arena")) return null;
  return <ChatWidget />;
}
