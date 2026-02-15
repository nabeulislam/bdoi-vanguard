"use client";

import { useEffect, useState } from "react";
import { supabase, ViolationLog, severityColor, severityBg } from "@/lib/supabase";

export default function ViolationsPage() {
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<ViolationLog | null>(null);
  const [verdictReason, setVerdictReason] = useState("");

  useEffect(() => {
    loadViolations();

    const channel = supabase
      .channel("violations-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "violation_logs" },
        (payload) => {
          setViolations((prev) => [payload.new as ViolationLog, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadViolations() {
    const { data } = await supabase
      .from("violation_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (data) setViolations(data);
  }

  async function submitVerdict(violationId: string, verdict: "CONFIRMED" | "DISMISSED") {
    await supabase.from("flagged_events").insert({
      violation_id: violationId,
      contest_id: selected?.contest_id,
      contestant_id: selected?.contestant_id,
      verdict,
      reviewed_by: "admin", // TODO: use actual auth user
      review_reason: verdictReason,
      reviewed_at: new Date().toISOString(),
    });
    setSelected(null);
    setVerdictReason("");
  }

  const filtered = violations.filter(
    (v) => filter === "all" || v.severity === filter
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Violations</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {["all", "FLAG", "WARN", "WATCH", "CLEAN"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filter === f
                ? "bg-vanguard-accent/20 border-vanguard-accent text-vanguard-accent"
                : "border-vanguard-border text-gray-500 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Violation list */}
        <div className="col-span-2 space-y-2 max-h-[80vh] overflow-y-auto">
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className={`w-full text-left p-3 rounded border transition-colors ${
                selected?.id === v.id ? "ring-2 ring-vanguard-accent" : ""
              } ${severityBg(v.severity)} hover:brightness-110`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-bold ${severityColor(v.severity)}`}>
                    {v.severity}
                  </span>
                  <span className="text-sm">{v.summary}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(v.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {v.contestant_name || v.contestant_id} · {v.source}
              </p>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 sticky top-6 h-fit">
          {selected ? (
            <div>
              <h3 className="font-semibold mb-3">Event Details</h3>
              <div className="space-y-2 text-sm">
                <Detail label="Severity" value={selected.severity} className={severityColor(selected.severity)} />
                <Detail label="Source" value={selected.source} />
                <Detail label="Contestant" value={selected.contestant_name || selected.contestant_id} />
                <Detail label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
                <Detail label="Time" value={new Date(selected.timestamp).toLocaleString()} />
                <Detail label="Evidence Hash" value={selected.evidence_hash.slice(0, 16) + "..."} />
              </div>

              {/* Raw evidence JSON */}
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-1">Evidence Details</p>
                <pre className="bg-black/50 p-3 rounded text-xs overflow-auto max-h-48 text-green-400">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>

              {/* Verdict system */}
              {selected.severity === "FLAG" || selected.severity === "WARN" ? (
                <div className="mt-4 border-t border-vanguard-border pt-4">
                  <p className="text-xs text-gray-500 mb-2">Admin Verdict</p>
                  <textarea
                    value={verdictReason}
                    onChange={(e) => setVerdictReason(e.target.value)}
                    placeholder="Reason for verdict (required)..."
                    className="w-full bg-black/30 border border-vanguard-border rounded p-2 text-sm mb-2 resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitVerdict(selected.id, "CONFIRMED")}
                      disabled={!verdictReason.trim()}
                      className="flex-1 bg-red-500/20 border border-red-500/50 text-red-400 rounded px-3 py-1.5 text-xs hover:bg-red-500/30 disabled:opacity-30"
                    >
                      ✓ Confirm Violation
                    </button>
                    <button
                      onClick={() => submitVerdict(selected.id, "DISMISSED")}
                      disabled={!verdictReason.trim()}
                      className="flex-1 bg-green-500/20 border border-green-500/50 text-green-400 rounded px-3 py-1.5 text-xs hover:bg-green-500/30 disabled:opacity-30"
                    >
                      ✗ Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">
              Select a violation to view details
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={className || "text-white"}>{value}</span>
    </div>
  );
}
