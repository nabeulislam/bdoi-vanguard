"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Contest {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", duration: "180" });
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadContests();
  }, []);

  async function loadContests() {
    const { data } = await supabase
      .from("contests")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setContests(data);
  }

  async function createContest(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const mins = parseInt(form.duration) || 180;
    const start = new Date();
    const end = new Date(start.getTime() + mins * 60 * 1000);

    const { error } = await supabase.from("contests").insert({
      name: form.name,
      description: form.description || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_active: false,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      setForm({ name: "", description: "", duration: "180" });
      setShowForm(false);
    }
    setCreating(false);
    loadContests();
  }

  async function startNow(c: Contest) {
    const mins = Math.round((new Date(c.end_time).getTime() - new Date(c.start_time).getTime()) / 60000);
    const start = new Date();
    const end = new Date(start.getTime() + mins * 60 * 1000);
    await supabase.from("contests").update({
      is_active: true,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    }).eq("id", c.id);
    loadContests();
  }

  async function stopNow(id: string) {
    await supabase.from("contests").update({
      is_active: false,
      end_time: new Date().toISOString(),
    }).eq("id", id);
    loadContests();
  }

  async function deleteContest(id: string) {
    if (!confirm("Delete this contest and all associated data?")) return;
    await supabase.from("contests").delete().eq("id", id);
    loadContests();
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function timeLeft(end: string) {
    const ms = new Date(end).getTime() - Date.now();
    if (ms <= 0) return "Ended";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  }

  function durationMins(start: string, end: string) {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manage Contests</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-vanguard-accent/20 border border-vanguard-accent/50 text-vanguard-accent rounded-lg text-sm hover:bg-vanguard-accent/30 transition-colors"
        >
          {showForm ? "Cancel" : "+ New Contest"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createContest} className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 uppercase mb-1">Contest Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="BDOI 2026 National Round"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="180"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-4 px-6 py-2 bg-gradient-to-r from-vanguard-accent to-vanguard-purple text-white font-semibold rounded text-sm hover:opacity-90 disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create Contest"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {contests.map((c) => (
          <div
            key={c.id}
            className="bg-vanguard-card border border-vanguard-border rounded-lg p-4"
          >
            {/* Top row: name + status */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{c.name}</h3>
                {c.is_active ? (
                  <span className="text-xs bg-vanguard-green/20 text-vanguard-green border border-vanguard-green/30 px-2 py-0.5 rounded-full animate-pulse">
                    🟢 LIVE — {timeLeft(c.end_time)}
                  </span>
                ) : new Date(c.end_time) < new Date() && c.start_time !== c.end_time ? (
                  <span className="text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded-full">
                    ENDED
                  </span>
                ) : (
                  <span className="text-xs bg-vanguard-yellow/20 text-vanguard-yellow border border-vanguard-yellow/30 px-2 py-0.5 rounded-full">
                    READY
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!c.is_active && new Date(c.end_time) >= new Date() && (
                  <button
                    onClick={() => startNow(c)}
                    className="px-4 py-1.5 text-sm rounded-lg font-semibold bg-vanguard-green/20 border border-vanguard-green/50 text-vanguard-green hover:bg-vanguard-green/30 transition-colors"
                  >
                    ▶ Start Now
                  </button>
                )}
                {c.is_active && (
                  <button
                    onClick={() => stopNow(c.id)}
                    className="px-4 py-1.5 text-sm rounded-lg font-semibold bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    ⏹ End Now
                  </button>
                )}
                {!c.is_active && (
                  <button
                    onClick={() => deleteContest(c.id)}
                    className="px-3 py-1.5 text-xs rounded border border-red-500/20 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {c.description && <p className="text-xs text-gray-500 mb-2">{c.description}</p>}

            {/* Contest ID — prominent, copyable */}
            <div className="flex items-center gap-2 mb-2 bg-black/30 rounded-lg px-3 py-2 border border-vanguard-border">
              <span className="text-xs text-gray-500 uppercase font-medium shrink-0">Contest ID</span>
              <code className="text-sm text-vanguard-accent font-mono flex-1 select-all">{c.id}</code>
              <button
                onClick={() => copyId(c.id)}
                className="text-xs px-2 py-1 rounded bg-vanguard-accent/10 border border-vanguard-accent/30 text-vanguard-accent hover:bg-vanguard-accent/20 transition-colors shrink-0"
              >
                {copied === c.id ? "✓ Copied!" : "Copy"}
              </button>
            </div>

            {/* Duration + time info */}
            <p className="text-xs text-gray-600">
              Duration: {durationMins(c.start_time, c.end_time)} min
              {c.is_active && <> · Started {new Date(c.start_time).toLocaleTimeString()} · Ends {new Date(c.end_time).toLocaleTimeString()}</>}
            </p>
          </div>
        ))}
        {contests.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No contests yet. Click &quot;+ New Contest&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
