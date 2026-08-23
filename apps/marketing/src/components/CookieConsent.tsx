"use client";

import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "cf-cookie-consent";

export function CookieConsent() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    setDecided(Boolean(localStorage.getItem(STORAGE_KEY)));
  }, []);

  function decide(choice: "accepted" | "necessary-only") {
    localStorage.setItem(STORAGE_KEY, choice);
    setDecided(true);
  }

  return (
    <AnimatePresence>
      {!decided && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          role="region"
          aria-label="Cookie notice"
          className="fixed bottom-24 left-6 z-50 flex w-[calc(100vw-3rem)] max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.06),0_24px_56px_-16px_rgba(15,23,42,0.22)] sm:bottom-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Cookie className="size-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Your privacy is respected</h2>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-600">
            We use only what&apos;s essential to run this site - no ad or analytics trackers. Read
            the{" "}
            <a href="/cookies" className="font-medium text-accent hover:text-accent-hover">
              cookie policy
            </a>{" "}
            for the specifics.
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => decide("necessary-only")}
              className="text-sm font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900"
            >
              Necessary only
            </button>
            <Button size="sm" onClick={() => decide("accepted")}>
              Accept
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
