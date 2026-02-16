"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, severityColor, severityBg, type Severity } from "@/lib/supabase";

interface ContestantWithStats {
  contestant_id: string;
  contestant_name: string;
  status: Severity;
  flag_count: number;
  warn_count: number;
  watch_count: number;
  total_events: number;
  last_event: string;
}

export default function ContestantsPage() {
  const [contestants, setContestants] = useState<ContestantWithStats[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadContestants();
  }, []);

  async function loadContestants() {
    const { data: violations } = await supabase
      .from("violation_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (!violations) return;

    const map = new Map<string, ContestantWithStats>();
    for (const v of violations) {
      const existing = map.get(v.contestant_id);
      if (existing) {
        existing.total_events++;
        if (v.severity === "FLAG") existing.flag_count++;
        if (v.severity === "WARN") existing.warn_count++;
        if (v.severity === "WATCH") existing.watch_count++;
        if (v.severity === "FLAG" && existing.status !== "FLAG") existing.status = "FLAG";
        else if (v.severity === "WARN" && existing.status === "CLEAN") existing.status = "WARN";
      } else {
        map.set(v.contestant_id, {
          contestant_id: v.contestant_id,
          contestant_name: v.contestant_name || v.contestant_id,
          status: v.severity === "CLEAN" ? "CLEAN" : (v.severity as Severity),
          flag_count: v.severity === "FLAG" ? 1 : 0,
          warn_count: v.severity === "WARN" ? 1 : 0,
          watch_count: v.severity === "WATCH" ? 1 : 0,
          total_events: 1,
          last_event: v.timestamp,
        });
      }
    }

    setContestants(
      Array.from(map.values()).sort((a, b) => {
        const order = { FLAG: 0, BAN: 0, WARN: 1, WATCH: 2, CLEAN: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      })
    );
  }

  function exportContestant(c: ContestantWithStats, format: "csv" | "json") {
    const row = {
      contestant_id: c.contestant_id,
      contestant_name: c.contestant_name,
      status: c.status,
      flags: c.flag_count,
      warnings: c.warn_count,
      watches: c.watch_count,
      total_events: c.total_events,
      last_activity: c.last_event,
    };
    let content: string;
    let mime: string;
    if (format === "json") {
      content = JSON.stringify(row, null, 2);
      mime = "application/json";
    } else {
      const headers = Object.keys(row);
      content = headers.join(",") + "\n" + headers.map((h) => `"${String((row as Record<string, unknown>)[h])}"`).join(",");
      mime = "text/csv";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contestant-${c.contestant_name}-summary.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteContestant(id: string, name: string) {
    if (!confirm(`Permanently delete ALL data for ${name}? This cannot be undone.`)) return;
    setDeleting(id);
    await supabase.from("violation_logs").delete().eq("contestant_id", id);
    await supabase.from("flagged_events").delete().eq("contestant_id", id);
    await supabase.from("sessions").delete().eq("contestant_id", id);
    setContestants((prev) => prev.filter((c) => c.contestant_id !== id));
    setDeleting(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Contestants</h1>

      <div className="bg-vanguard-card border border-vanguard-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vanguard-border text-gray-500 text-left">
              <th className="px-4 py-3">Contestant</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Flags</th>
              <th className="px-4 py-3 text-center">Warnings</th>
              <th className="px-4 py-3 text-center">Watches</th>
              <th className="px-4 py-3 text-center">Total</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contestants.map((c) => (
              <tr
                key={c.contestant_id}
                onClick={() => router.push(`/contestants/${c.contestant_id}`)}
                className="border-b border-vanguard-border/50 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium">{c.contestant_name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold border ${severityBg(c.status)} ${severityColor(c.status)}`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-vanguard-red">
                  {c.flag_count || "—"}
                </td>
                <td className="px-4 py-3 text-center text-orange-500">
                  {c.warn_count || "—"}
                </td>
                <td className="px-4 py-3 text-center text-vanguard-yellow">
                  {c.watch_count || "—"}
                </td>
                <td className="px-4 py-3 text-center text-gray-400">
                  {c.total_events}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(c.last_event).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => exportContestant(c, "csv")}
                      title="Export CSV"
                      className="px-2 py-1 text-[10px] rounded border border-vanguard-border text-gray-500 hover:text-white transition-colors"
                    >
                      📥
                    </button>
                    <button
                      onClick={() => deleteContestant(c.contestant_id, c.contestant_name)}
                      disabled={deleting === c.contestant_id}
                      title="Delete all data"
                      className="px-2 py-1 text-[10px] rounded border border-red-500/30 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {contestants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No contestant data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
