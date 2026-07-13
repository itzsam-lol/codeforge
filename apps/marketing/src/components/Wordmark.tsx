import { LogoMark } from "@/components/LogoMark";
import { cn } from "@/lib/utils";

export function Wordmark({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
        <LogoMark size={18} />
      </span>
      <span className={cn("text-lg font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>
        CodeForge
      </span>
    </span>
  );
}
