import { ArenaAuthProvider } from "@/lib/arenaAuthContext";
import { ArenaHeader } from "@/components/arena/ArenaHeader";
import { Footer } from "@/components/footer/Footer";

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArenaAuthProvider>
      <div className="min-h-screen bg-[#05070f]">
        <ArenaHeader />
        {children}
        <Footer />
      </div>
    </ArenaAuthProvider>
  );
}
