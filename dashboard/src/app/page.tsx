"use client";

import { useEffect, useState } from "react";
import { supabase, ViolationLog, severityColor, severityBg } from "@/lib/supabase";

interface SessionSummary {
  online: number;
  stale: number;
  disconnected: number;
}

export default function DashboardHome() {
  const [recentViolations, setRecentViolations] = useState<ViolationLog[]>([]);
  const [stats, setStats] = useState({ total: 0, flags: 0, warns: 0 });
  const [sessions, setSessions] = useState<SessionSummary>({ online: 0, stale: 0, disconnected: 0 });

  useEffect(() => {
    loadData();
    loadSessions();
    const timer = setInterval(loadSessions, 10_000);

    const channel = supabase
      .channel("violations-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "violation_logs" },
        (payload) => {
          const v = payload.new as ViolationLog;
          if (v.severity === "CLEAN") return;
          setRecentViolations((prev) => [v, ...prev].slice(0, 50));
          setStats((prev) => ({
            total: prev.total + 1,
            flags: v.severity === "FLAG" ? prev.flags + 1 : prev.flags,
            warns: v.severity === "WARN" ? prev.warns + 1 : prev.warns,
          }));
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    const { data: violations, count } = await supabase
      .from("violation_logs")
      .select("*", { count: "exact" })
      .is("archived_at", null)
      .neq("severity", "CLEAN")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (violations) {
      setRecentViolations(violations);
    }

    // Get total counts from all violations
    const { count: totalCount } = await supabase
      .from("violation_logs")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .neq("severity", "CLEAN");
    const { count: flagCount } = await supabase
      .from("violation_logs")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("severity", "FLAG");
    const { count: warnCount } = await supabase
      .from("violation_logs")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("severity", "WARN");

    setStats({
      total: totalCount ?? 0,
      flags: flagCount ?? 0,
      warns: warnCount ?? 0,
    });
  }

  async function loadSessions() {
    const { data } = await supabase.from("sessions").select("is_active, last_heartbeat");
    if (!data) return;

    const now = Date.now();
    let online = 0, stale = 0, disconnected = 0;
    for (const s of data) {
      if (!s.is_active) { disconnected++; continue; }
      const diff = now - new Date(s.last_heartbeat).getTime();
      if (diff > 90_000) stale++;
      else online++;
    }
    setSessions({ online, stale, disconnected });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        <span className="bg-gradient-to-r from-vanguard-accent to-vanguard-purple bg-clip-text text-transparent">
          BDOI Vanguard
        </span>{" "}
        Dashboard
      </h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Agents Online" value={sessions.online} color="text-vanguard-green" />
        <StatCard label="Stale / Lost" value={sessions.stale} color="text-yellow-400" />
        <StatCard label="Total Events" value={stats.total} color="text-white" />
        <StatCard label="Flags" value={stats.flags} color="text-vanguard-red" />
        <StatCard label="Warnings" value={stats.warns} color="text-orange-500" />
      </div>

      {/* Live violation feed */}
      <div className="bg-vanguard-card border border-vanguard-border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Live Violations Feed</h2>
        {recentViolations.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No violations detected yet. Events will appear here in realtime.
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {recentViolations.map((v) => (
              <div
                key={v.id}
                className={`p-3 rounded border ${severityBg(v.severity)} flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${severityColor(v.severity)}`}>
                    {v.severity}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{v.summary}</p>
                    <p className="text-xs text-gray-500">
                      {v.contestant_name || v.contestant_id} · {v.source} ·{" "}
                      {new Date(v.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <a
                  href={`/violations?id=${v.id}`}
                  className="text-xs text-vanguard-accent hover:underline"
                >
                  View →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-vanguard-card border border-vanguard-border rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
