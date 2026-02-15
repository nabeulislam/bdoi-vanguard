"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Session {
  id: string;
  contest_id: string;
  contestant_id: string;
  agent_version: string | null;
  os_info: string | null;
  started_at: string;
  last_heartbeat: string;
  is_active: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    loadSessions();

    const channel = supabase
      .channel("sessions-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => loadSessions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadSessions() {
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);
    if (data) setSessions(data);
  }

  function isStale(lastHeartbeat: string): boolean {
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    return diff > 60_000; // stale if no heartbeat in 60s
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Agent Sessions</h1>

      <div className="bg-vanguard-card border border-vanguard-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vanguard-border text-gray-500 text-left">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contestant</th>
              <th className="px-4 py-3">OS</th>
              <th className="px-4 py-3">Agent Version</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const stale = isStale(s.last_heartbeat);
              return (
                <tr
                  key={s.id}
                  className="border-b border-vanguard-border/50 hover:bg-white/5"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          s.is_active && !stale
                            ? "bg-vanguard-green animate-pulse"
                            : stale
                            ? "bg-vanguard-yellow"
                            : "bg-gray-600"
                        }`}
                      />
                      <span className="text-xs text-gray-400">
                        {s.is_active && !stale
                          ? "Online"
                          : stale
                          ? "Stale"
                          : "Offline"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{s.contestant_id}</td>
                  <td className="px-4 py-3 text-gray-400">{s.os_info || "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{s.agent_version || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(s.last_heartbeat).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No sessions yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
