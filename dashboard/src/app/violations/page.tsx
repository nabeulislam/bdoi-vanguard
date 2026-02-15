"use client";

import { useEffect, useState } from "react";
import { supabase, ViolationLog, severityColor, severityBg } from "@/lib/supabase";

export default function ViolationsPage() {
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [contestFilter, setContestFilter] = useState<string>("all");
  const [contests, setContests] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<ViolationLog | null>(null);
  const [verdictReason, setVerdictReason] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadViolations();
    loadContests();

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
      .limit(500);
    if (data) setViolations(data);

    // Load archived IDs from localStorage
    try {
      const stored = localStorage.getItem("vanguard_archived");
      if (stored) setArchivedIds(new Set(JSON.parse(stored)));
    } catch {}
  }

  async function loadContests() {
    const { data } = await supabase.from("contests").select("id, name");
    if (data) setContests(data);
  }

  async function submitVerdict(violationId: string, verdict: "CONFIRMED" | "DISMISSED") {
    await supabase.from("flagged_events").insert({
      violation_id: violationId,
      contest_id: selected?.contest_id,
      contestant_id: selected?.contestant_id,
      verdict,
      reviewed_by: "admin",
      review_reason: verdictReason,
      reviewed_at: new Date().toISOString(),
    });
    setSelected(null);
    setVerdictReason("");
  }

  function archiveContest(contestId: string) {
    const ids = violations.filter(v => v.contest_id === contestId).map(v => v.id);
    const next = new Set([...archivedIds, ...ids]);
    setArchivedIds(next);
    localStorage.setItem("vanguard_archived", JSON.stringify([...next]));
  }

  function unarchiveAll() {
    setArchivedIds(new Set());
    localStorage.removeItem("vanguard_archived");
  }

  async function deleteContestViolations(contestId: string) {
    if (!confirm("Permanently delete ALL violations for this contest? This cannot be undone.")) return;
    await supabase.from("violation_logs").delete().eq("contest_id", contestId);
    setViolations(prev => prev.filter(v => v.contest_id !== contestId));
    setSelected(null);
  }

  function exportViolations(format: "csv" | "json") {
    const data = filtered;
    let content: string;
    let mime: string;
    let ext: string;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mime = "application/json";
      ext = "json";
    } else {
      const headers = ["timestamp", "severity", "source", "contestant_name", "contestant_id", "summary", "confidence", "evidence_hash"];
      const rows = data.map(v =>
        headers.map(h => {
          const val = String((v as Record<string, unknown>)[h] || "");
          return '"' + val.replace(/"/g, '""') + '"';
        }).join(",")
      );
      content = headers.join(",") + "\n" + rows.join("\n");
      mime = "text/csv";
      ext = "csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `violations-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = violations.filter((v) => {
    if (!showArchived && archivedIds.has(v.id)) return false;
    if (filter !== "all" && v.severity !== filter) return false;
    if (contestFilter !== "all" && v.contest_id !== contestFilter) return false;
    return true;
  });

  const liveCount = violations.filter(v => !archivedIds.has(v.id)).length;
  const archivedCount = archivedIds.size;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Violations</h1>
        <div className="flex gap-2">
          <button
            onClick={() => exportViolations("csv")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => exportViolations("json")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 Export JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
        <span className="text-gray-600 mx-1">|</span>
        <select
          value={contestFilter}
          onChange={(e) => setContestFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded border border-vanguard-border bg-vanguard-card text-gray-400 outline-none"
        >
          <option value="all">All Contests</option>
          {contests.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="text-gray-600 mx-1">|</span>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`px-3 py-1.5 text-xs rounded border transition-colors ${
            showArchived
              ? "border-vanguard-accent text-vanguard-accent"
              : "border-vanguard-border text-gray-500"
          }`}
        >
          {showArchived ? "Hide Archived" : `Show Archived (${archivedCount})`}
        </button>
      </div>

      {/* Contest actions */}
      {contestFilter !== "all" && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => archiveContest(contestFilter)}
            className="px-3 py-1.5 text-xs rounded border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
          >
            📦 Archive This Contest&apos;s Violations
          </button>
          <button
            onClick={() => deleteContestViolations(contestFilter)}
            className="px-3 py-1.5 text-xs rounded border border-red-500/30 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            🗑 Delete This Contest&apos;s Violations
          </button>
        </div>
      )}
      {archivedCount > 0 && contestFilter === "all" && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={unarchiveAll}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-500 hover:text-white transition-colors"
          >
            Unarchive All
          </button>
        </div>
      )}

      <p className="text-xs text-gray-600 mb-3">{liveCount} live · {filtered.length} shown</p>

      <div className="grid grid-cols-3 gap-6">
        {/* Violation list */}
        <div className="col-span-2 space-y-2 max-h-[80vh] overflow-y-auto">
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className={`w-full text-left p-3 rounded border transition-colors ${
                selected?.id === v.id ? "ring-2 ring-vanguard-accent" : ""
              } ${archivedIds.has(v.id) ? "opacity-40" : ""} ${severityBg(v.severity)} hover:brightness-110`}
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
          {filtered.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">No violations match filters</p>
          )}
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

              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-1">Evidence Details</p>
                <pre className="bg-black/50 p-3 rounded text-xs overflow-auto max-h-48 text-green-400">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>

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
