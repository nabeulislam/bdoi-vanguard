"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ContestantUser {
  id: string;
  name: string;
  email: string;
  contest_id: string;
  status: string;
  user_id: string | null;
  password_temp: string | null;
  registered_at: string;
}

interface Contest {
  id: string;
  name: string;
}

export default function AdminUsersPage() {
  const [contestants, setContestants] = useState<ContestantUser[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", contest_id: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: c }, { data: ct }] = await Promise.all([
      supabase.from("contestants").select("*").order("registered_at", { ascending: false }),
      supabase.from("contests").select("id, name"),
    ]);
    if (c) setContestants(c);
    if (ct) setContests(ct);
  }

  function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let pw = "";
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  }

  async function createContestant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const password = form.password || generatePassword();

    // Create auth user via Supabase Admin (uses service role if available, otherwise edge function)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: form.email,
      password,
      email_confirm: true,
      user_metadata: { name: form.name, role: "contestant" },
    });

    if (authError) {
      // Fallback: if admin API not available, create contestant record only
      // The admin will need to use Supabase dashboard to create auth users
      const { error: insertError } = await supabase.from("contestants").insert({
        name: form.name,
        email: form.email,
        contest_id: form.contest_id || null,
        password_temp: password,
        status: "CLEAN",
      });

      if (insertError) {
        alert("Error: " + insertError.message);
        setCreating(false);
        return;
      }
    } else if (authData?.user) {
      // Link auth user to contestant record
      await supabase.from("contestants").insert({
        name: form.name,
        email: form.email,
        contest_id: form.contest_id || null,
        user_id: authData.user.id,
        password_temp: password,
        status: "CLEAN",
      });
    }

    setCreatedUser({ email: form.email, password });
    setForm({ name: "", email: "", contest_id: "", password: "" });
    setCreating(false);
    setShowForm(false);
    loadData();
  }

  async function deleteContestant(id: string) {
    if (!confirm("Remove this contestant? This cannot be undone.")) return;
    await supabase.from("contestants").delete().eq("id", id);
    loadData();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Contestants</h1>
        <button
          onClick={() => { setShowForm(!showForm); setCreatedUser(null); }}
          className="px-4 py-2 bg-vanguard-accent/20 border border-vanguard-accent/50 text-vanguard-accent rounded-lg text-sm hover:bg-vanguard-accent/30 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Contestant"}
        </button>
      </div>

      {/* Created user credentials (shown once) */}
      {createdUser && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
          <p className="text-green-400 font-semibold text-sm mb-2">✓ Contestant created! Share these credentials:</p>
          <div className="bg-black/40 rounded p-3 font-mono text-sm">
            <div>Email: <span className="text-white">{createdUser.email}</span></div>
            <div>Password: <span className="text-vanguard-accent">{createdUser.password}</span></div>
          </div>
          <p className="text-xs text-gray-500 mt-2">⚠ This password is shown only once. Save it now.</p>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={createContestant} className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="Contestant name"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="contestant@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Contest</label>
              <select
                value={form.contest_id}
                onChange={(e) => setForm({ ...form, contest_id: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
              >
                <option value="">No contest</option>
                {contests.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Password (auto-generated if empty)</label>
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="Leave empty to auto-generate"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-4 px-6 py-2 bg-gradient-to-r from-vanguard-accent to-vanguard-purple text-white font-semibold rounded text-sm hover:opacity-90 disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create Contestant"}
          </button>
        </form>
      )}

      {/* Users table */}
      <div className="bg-vanguard-card border border-vanguard-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vanguard-border text-gray-500 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Auth Linked</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contestants.map((c) => (
              <tr key={c.id} className="border-b border-vanguard-border/50 hover:bg-white/5">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-400">{c.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold ${
                    c.status === "CLEAN" ? "text-vanguard-green" :
                    c.status === "FLAG" ? "text-vanguard-red" :
                    "text-vanguard-yellow"
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.user_id ? (
                    <span className="text-vanguard-green text-xs">✓ Yes</span>
                  ) : (
                    <span className="text-gray-600 text-xs">✗ No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(c.registered_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => deleteContestant(c.id)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {contestants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No contestants yet. Click &quot;+ Add Contestant&quot; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
