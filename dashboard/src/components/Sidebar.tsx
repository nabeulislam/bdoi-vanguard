"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/violations", label: "Violations", icon: "🚨" },
  { href: "/contestants", label: "Contestants", icon: "👥" },
  { href: "/sessions", label: "Sessions", icon: "💻" },
];

const adminItems = [
  { href: "/admin/users", label: "Manage Users", icon: "🔑" },
  { href: "/admin/contests", label: "Manage Contests", icon: "🏆" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-vanguard-card border-r border-vanguard-border flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-extrabold">
          <span className="bg-gradient-to-r from-vanguard-accent to-vanguard-purple bg-clip-text text-transparent">
            BDOI VANGUARD
          </span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Admin Dashboard</p>
      </div>

      <nav className="flex-1 px-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider px-3 mb-1">Monitor</p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors ${
                isActive
                  ? "bg-vanguard-accent/10 text-vanguard-accent"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <p className="text-[10px] text-gray-600 uppercase tracking-wider px-3 mb-1 mt-4">Admin</p>
        {adminItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors ${
                isActive
                  ? "bg-vanguard-accent/10 text-vanguard-accent"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-vanguard-border">
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-gray-600 hover:text-gray-400 transition-colors mb-2"
        >
          ← Sign Out
        </button>
        <p className="text-xs text-gray-700">v0.1.0</p>
      </div>
    </aside>
  );
}
