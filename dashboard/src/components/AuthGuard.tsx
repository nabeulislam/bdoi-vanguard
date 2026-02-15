"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "./Sidebar";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
        if (pathname !== "/login") router.push("/login");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setAuthenticated(true);
    } else if (pathname !== "/login") {
      router.push("/login");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-vanguard-bg flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!authenticated && pathname !== "/login") {
    return null;
  }

  // Login page: no sidebar
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Authenticated pages: sidebar layout
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 ml-0 sm:ml-64">{children}</main>
    </div>
  );
}
