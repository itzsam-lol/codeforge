"use client";

import { usePathname } from "next/navigation";
import { ArenaAuthProvider } from "@/lib/arenaAuthContext";
import { ArenaHeader } from "@/components/arena/ArenaHeader";
import { ArenaToastProvider } from "@/components/arena/ArenaToast";
import { Footer } from "@/components/footer/Footer";

// A nested app/arena/contests/[slug]/compete/layout.tsx CANNOT remove this
// layout's header/footer on its own — Next's App Router nests layouts
// (a child renders INSIDE its parent's {children} slot), it never overrides
// an ancestor. The compete page needs a fully immersive, chrome-free
// viewport (BUG-3), so the only real fix is this layout knowing to skip its
// own chrome for that one route.
function isImmersiveRoute(pathname: string | null): boolean {
  return Boolean(pathname?.includes("/compete"));
}

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);

  return (
    <ArenaAuthProvider>
      <ArenaToastProvider>
        <div className="min-h-screen bg-[#05070f]">
          {immersive ? null : <ArenaHeader />}
          {children}
          {immersive ? null : <Footer />}
        </div>
      </ArenaToastProvider>
    </ArenaAuthProvider>
  );
}
