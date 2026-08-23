"use client";

import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, X, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveRobotSpline } from "@/components/InteractiveRobotSpline";

const SPLINE_SCENE =
  process.env.NEXT_PUBLIC_SPLINE_SCENE_URL ??
  "https://prod.spline.design/replace-with-your-scene-id/scene.splinecode";

const HAS_VALID_SPLINE = !SPLINE_SCENE.includes("replace-with-your-scene-id");

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Message = {
  role: "assistant",
  content: "Hi, I'm the CodeForge assistant. Ask me about assessment types, self-hosting, or how to book a demo.",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.8, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, y: 0, scale: 1, transformOrigin: "bottom right" }}
            exit={{ opacity: 0, y: 40, scale: 0.8, transformOrigin: "bottom right" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="flex h-[min(520px,70vh)] w-[calc(100vw-3rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl origin-bottom-right ring-1 ring-slate-200"
          >
            <div className="relative flex h-40 shrink-0 items-center justify-center bg-slate-900">
              {HAS_VALID_SPLINE ? (
                <InteractiveRobotSpline scene={SPLINE_SCENE} className="h-full w-full" />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <Bot className="h-12 w-12 mb-2 opacity-50" />
                  <span className="text-xs uppercase tracking-widest opacity-50">Assistant</span>
                </div>
              )}
              
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4 bg-slate-50">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                    m.role === "user"
                      ? "ml-auto bg-accent text-white rounded-br-sm"
                      : "bg-white text-slate-800 rounded-bl-sm ring-1 ring-slate-200/50"
                  )}
                >
                  {m.content}
                </motion.div>
              ))}
              {busy && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white ring-1 ring-slate-200/50 px-4 py-3 text-sm text-slate-500 shadow-sm flex items-center gap-1.5"
                >
                  <span className="flex gap-0.5">
                    <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </span>
                </motion.div>
              )}
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-rose-600 px-1">
                  {error}
                </motion.div>
              )}
            </div>

            <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about CodeForge..."
                maxLength={1000}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:bg-white"
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm disabled:opacity-40"
              >
                <Send className="h-4 w-4 ml-0.5" />
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={open ? "Close chat" : "Open chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.15 }}
          >
            {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          </motion.div>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
