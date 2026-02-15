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
  const [form, setForm] = useState({
    name: "",
    description: "",
    start_time: "",
    end_time: "",
  });
  const [creating, setCreating] = useState(false);

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

    const { error } = await supabase.from("contests").insert({
      name: form.name,
      description: form.description || null,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
      is_active: false,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      setForm({ name: "", description: "", start_time: "", end_time: "" });
      setShowForm(false);
    }
    setCreating(false);
    loadContests();
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("contests").update({ is_active: !current }).eq("id", id);
    loadContests();
  }

  async function deleteContest(id: string) {
    if (!confirm("Delete this contest and all associated data?")) return;
    await supabase.from("contests").delete().eq("id", id);
    loadContests();
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
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 uppercase mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">Start Time</label>
              <input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase mb-1">End Time</label>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full bg-black/30 border border-vanguard-border rounded px-3 py-2 text-sm text-white outline-none focus:border-vanguard-accent"
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
            className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{c.name}</h3>
                {c.is_active && (
                  <span className="text-xs bg-vanguard-green/20 text-vanguard-green border border-vanguard-green/30 px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                )}
              </div>
              {c.description && <p className="text-xs text-gray-500 mb-1">{c.description}</p>}
              <p className="text-xs text-gray-600">
                {new Date(c.start_time).toLocaleString()} → {new Date(c.end_time).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleActive(c.id, c.is_active)}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  c.is_active
                    ? "border-vanguard-yellow/50 text-vanguard-yellow hover:bg-vanguard-yellow/10"
                    : "border-vanguard-green/50 text-vanguard-green hover:bg-vanguard-green/10"
                }`}
              >
                {c.is_active ? "Stop" : "Start"}
              </button>
              <button
                onClick={() => deleteContest(c.id)}
                className="px-3 py-1.5 text-xs rounded border border-red-500/30 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            </div>
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
