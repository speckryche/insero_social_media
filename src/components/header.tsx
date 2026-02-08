import { MobileNav } from "@/components/sidebar";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-4 md:px-6">
      <MobileNav />
      <h1 className="text-lg font-semibold text-gray-900">
        Insero Social Hub
      </h1>
    </header>
  );
}
