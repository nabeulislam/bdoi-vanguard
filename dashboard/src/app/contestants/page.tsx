"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    loadContestants();
  }, []);

  async function loadContestants() {
    const { data: violations } = await supabase
      .from("violation_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (!violations) return;

    // Aggregate by contestant
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
              <th className="px-4 py-3 text-center">Total Events</th>
              <th className="px-4 py-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {contestants.map((c) => (
              <tr
                key={c.contestant_id}
                className="border-b border-vanguard-border/50 hover:bg-white/5 transition-colors"
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
              </tr>
            ))}
            {contestants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
