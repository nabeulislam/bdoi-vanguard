"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen bg-vanguard-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold">
            <span className="bg-gradient-to-r from-vanguard-accent to-vanguard-purple bg-clip-text text-transparent">
              BDOI VANGUARD
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Admin Dashboard</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-vanguard-card border border-vanguard-border rounded-lg p-6"
        >
          <div className="mb-4">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent transition-colors"
              placeholder="admin@bdoi.org"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-vanguard-red text-xs mb-3">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-vanguard-accent to-vanguard-purple text-white font-semibold py-2 rounded text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
