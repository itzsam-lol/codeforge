"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const menuItems = [
  { name: "Features", href: "#features" },
  { name: "Why Self-Hosted", href: "#why-self-hosted" },
  { name: "How It Works", href: "#how-it-works" },
  { name: "Contact", href: "#contact" },
];

export function HeroHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 50);
    }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header>
      <nav data-state={menuOpen && "active"} className="group fixed z-20 w-full px-2">
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12",
            scrolled &&
              "max-w-4xl rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-lg lg:px-5"
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <a href="#" aria-label="CodeForge home" className="flex items-center">
                <Wordmark dark={!scrolled} />
              </a>

              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                className={cn(
                  "relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden",
                  scrolled || menuOpen ? "text-slate-900" : "text-white"
                )}
              >
                <Menu
                  className={cn(
                    "m-auto size-6 duration-200",
                    menuOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 duration-200",
                    menuOpen ? "scale-100 opacity-100" : "scale-0 opacity-0"
                  )}
                />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className={cn(
                        "block duration-150",
                        scrolled
                          ? "text-slate-600 hover:text-slate-900"
                          : "text-white/70 hover:text-white"
                      )}
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                menuOpen ? "flex" : "hidden lg:flex",
                "mb-6 w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/20 md:flex-nowrap lg:m-0 lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none"
              )}
            >
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item) => (
                    <li key={item.name}>
                      <a href={item.href} className="block text-slate-600 duration-150 hover:text-slate-900">
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row md:w-fit">
                <Button href="mailto:support@codeforge.io?subject=Book%20a%20demo" size="sm">
                  Book a demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
