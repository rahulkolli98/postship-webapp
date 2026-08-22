"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

/**
 * App shell — TASK-022 (PRD § 8).
 *
 * Top nav: logo (left), account menu (right, Clerk UserButton).
 * Sidebar (desktop): Compose / History / Settings with active indicators.
 * Sidebar (mobile): hidden behind a hamburger that opens a Sheet drawer.
 *
 * Visual language per docs/design3.md: white chrome, ink text, mono
 * uppercase 11px nav labels, hairline borders, lime used sparingly.
 */

const NAV_ITEMS = [
  { href: "/compose", label: "Compose" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
] as const;

function Logo() {
  return (
    <Link
      href="/"
      className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-on-surface"
    >
      Postship
      <sup className="ml-0.5 text-[0.6em] text-accent">Ar</sup>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
              active
                ? "border-l-2 border-accent bg-accent-soft/40 text-on-surface"
                : "border-l-2 border-transparent text-on-surface-muted hover:text-on-surface"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background px-4 md:px-6">
        <div className="flex items-center gap-4">
          {/* Hamburger — mobile only */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Open navigation menu"
              className="rounded-md p-2 text-on-surface hover:bg-muted md:hidden"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-2 pb-4 pt-2">
                <Logo />
              </div>
              <Separator />
              <div className="pt-4">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Logo />
        </div>

        <UserButton afterSignOutUrl="/" />
      </header>

      <div className="flex flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden w-56 shrink-0 border-r border-border pt-6 md:block">
          <NavLinks />
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
