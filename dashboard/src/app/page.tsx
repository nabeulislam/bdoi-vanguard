"use client";

import { useEffect, useState } from "react";
import { supabase, ViolationLog, severityColor, severityBg } from "@/lib/supabase";

export default function DashboardHome() {
  const [recentViolations, setRecentViolations] = useState<ViolationLog[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    flags: 0,
    warns: 0,
    activeAgents: 0,
  });

  useEffect(() => {
    loadData();
    // Subscribe to realtime violations
    const channel = supabase
      .channel("violations-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "violation_logs" },
        (payload) => {
          setRecentViolations((prev) => [payload.new as ViolationLog, ...prev].slice(0, 50));
          setStats((prev) => ({
            ...prev,
            total: prev.total + 1,
            flags: (payload.new as ViolationLog).severity === "FLAG" ? prev.flags + 1 : prev.flags,
            warns: (payload.new as ViolationLog).severity === "WARN" ? prev.warns + 1 : prev.warns,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadData() {
    const { data: violations } = await supabase
      .from("violation_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (violations) {
      setRecentViolations(violations);
      setStats({
        total: violations.length,
        flags: violations.filter((v) => v.severity === "FLAG").length,
        warns: violations.filter((v) => v.severity === "WARN").length,
        activeAgents: new Set(violations.map((v) => v.contestant_id)).size,
      });
    }
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
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Events" value={stats.total} color="text-white" />
        <StatCard label="Flags" value={stats.flags} color="text-vanguard-red" />
        <StatCard label="Warnings" value={stats.warns} color="text-vanguard-yellow" />
        <StatCard label="Active Agents" value={stats.activeAgents} color="text-vanguard-green" />
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
                  View Details →
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
