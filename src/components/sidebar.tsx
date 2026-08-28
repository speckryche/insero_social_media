"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  Settings,
  Menu,
  ScrollText,
  ClipboardCheck,
  NotebookPen,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/batches", label: "Batches", icon: Layers },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/ready-to-post", label: "Ready to Post", icon: ClipboardCheck },
  { href: "/logs", label: "Publish Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="px-3 pb-3 mt-auto">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
      >
        <LogOut className="h-5 w-5" />
        {loading ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#1B2A4A]">
      <div className="flex h-20 items-center px-4">
        <Image
          src="/insero-logo-dark_bg-no-tagline-retina.png"
          alt="Insero"
          width={200}
          height={50}
          className="object-contain"
          priority
        />
      </div>
      <div className="mt-2 flex-1">
        <NavLinks />
      </div>
      <LogoutButton />
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          aria-label="Open navigation"
        >
          <Menu className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-[#1B2A4A] border-none flex flex-col">
        <div className="flex h-20 items-center px-4">
          <Image
            src="/insero-logo-dark_bg-no-tagline-retina.png"
            alt="Insero"
            width={200}
            height={50}
            className="object-contain"
          />
        </div>
        <div className="mt-2 flex-1">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <LogoutButton onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
