"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Session {
  id: string;
  contest_id: string;
  contestant_id: string;
  contestant_name: string | null;
  agent_version: string | null;
  os_info: string | null;
  started_at: string;
  last_heartbeat: string;
  is_active: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    loadSessions();
    const timer = setInterval(() => setNow(Date.now()), 5000);

    const channel = supabase
      .channel("sessions-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => loadSessions()
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadSessions() {
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);
    if (data) setSessions(data);
  }

  function getStatus(s: Session): { label: string; color: string; dot: string } {
    if (!s.is_active) return { label: "Disconnected", color: "text-red-400", dot: "bg-red-500" };
    const diff = now - new Date(s.last_heartbeat).getTime();
    if (diff > 90_000) return { label: "Lost Connection", color: "text-red-400", dot: "bg-red-500" };
    if (diff > 45_000) return { label: "Stale", color: "text-yellow-400", dot: "bg-yellow-500" };
    return { label: "Online", color: "text-vanguard-green", dot: "bg-vanguard-green animate-pulse" };
  }

  function ago(ts: string): string {
    const diff = Math.floor((now - new Date(ts).getTime()) / 1000);
    if (diff < 10) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function duration(start: string): string {
    const diff = Math.floor((now - new Date(start).getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const online = sessions.filter(s => getStatus(s).label === "Online").length;
  const total = sessions.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agent Sessions</h1>
        <div className="flex gap-4 text-sm">
          <span className="text-vanguard-green font-semibold">{online} online</span>
          <span className="text-gray-500">{total} total</span>
        </div>
      </div>

      <div className="bg-vanguard-card border border-vanguard-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vanguard-border text-gray-500 text-left">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contestant</th>
              <th className="px-4 py-3">OS</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Connected</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const status = getStatus(s);
              return (
                <tr
                  key={s.id}
                  className="border-b border-vanguard-border/50 hover:bg-white/5"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
                      <span className={`text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.contestant_name || "—"}</div>
                    <div className="text-xs text-gray-600 font-mono">{s.contestant_id.slice(0, 8)}...</div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{s.os_info || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.agent_version || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {duration(s.started_at)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={status.label === "Online" ? "text-vanguard-green" : "text-gray-500"}>
                      {ago(s.last_heartbeat)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No sessions yet — contestants will appear here when they sign in
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
