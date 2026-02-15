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
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadViolations();
    loadContests();
    loadArchivedCount();

    const channel = supabase
      .channel("violations-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "violation_logs" },
        (payload) => {
          const v = payload.new as ViolationLog;
          if (v.severity !== "CLEAN") {
            setViolations((prev) => [v, ...prev]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadViolations() {
    let query = supabase
      .from("violation_logs")
      .select("*")
      .neq("severity", "CLEAN")
      .order("timestamp", { ascending: false })
      .limit(500);

    if (!showArchived) {
      query = query.is("archived_at", null);
    }

    const { data } = await query;
    if (data) setViolations(data);
  }

  async function loadContests() {
    const { data } = await supabase.from("contests").select("id, name");
    if (data) setContests(data);
  }

  async function loadArchivedCount() {
    const { count } = await supabase
      .from("violation_logs")
      .select("*", { count: "exact", head: true })
      .not("archived_at", "is", null);
    setArchivedCount(count ?? 0);
  }

  // Toggle archived view
  useEffect(() => {
    loadViolations();
  }, [showArchived]);

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

  async function archiveContest(contestId: string) {
    setLoading(true);
    const now = new Date().toISOString();
    await supabase
      .from("violation_logs")
      .update({ archived_at: now })
      .eq("contest_id", contestId)
      .is("archived_at", null);
    await loadViolations();
    await loadArchivedCount();
    setLoading(false);
  }

  async function unarchiveContest(contestId: string) {
    setLoading(true);
    await supabase
      .from("violation_logs")
      .update({ archived_at: null })
      .eq("contest_id", contestId)
      .not("archived_at", "is", null);
    await loadViolations();
    await loadArchivedCount();
    setLoading(false);
  }

  async function deleteContestData(contestId: string) {
    if (!confirm("Permanently delete ALL violations AND sessions for this contest? This cannot be undone.")) return;
    setLoading(true);
    // Delete violations
    await supabase.from("violation_logs").delete().eq("contest_id", contestId);
    // Delete sessions
    await supabase.from("sessions").delete().eq("contest_id", contestId);
    // Delete flagged events
    await supabase.from("flagged_events").delete().eq("contest_id", contestId);
    setViolations(prev => prev.filter(v => v.contest_id !== contestId));
    await loadArchivedCount();
    setSelected(null);
    setLoading(false);
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
          const val = String((v as unknown as Record<string, unknown>)[h] || "");
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
    const contestName = contestFilter !== "all"
      ? contests.find(c => c.id === contestFilter)?.name || "contest"
      : "all";
    a.download = `violations-${contestName}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = violations.filter((v) => {
    if (filter !== "all" && v.severity !== filter) return false;
    if (contestFilter !== "all" && v.contest_id !== contestFilter) return false;
    return true;
  });

  const contestName = contestFilter !== "all"
    ? contests.find(c => c.id === contestFilter)?.name
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Violations</h1>
        <div className="flex gap-2">
          <button
            onClick={() => exportViolations("csv")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 CSV
          </button>
          <button
            onClick={() => exportViolations("json")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["all", "FLAG", "WARN", "WATCH"].map((f) => (
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
        <div className="flex items-center gap-2 mb-4 p-3 bg-vanguard-card border border-vanguard-border rounded-lg">
          <span className="text-sm text-gray-400 mr-2">
            Contest: <strong className="text-white">{contestName}</strong>
          </span>
          <button
            onClick={() => archiveContest(contestFilter)}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors disabled:opacity-30"
          >
            📦 Archive
          </button>
          {showArchived && (
            <button
              onClick={() => unarchiveContest(contestFilter)}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-30"
            >
              📤 Unarchive
            </button>
          )}
          <button
            onClick={() => exportViolations("csv")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white transition-colors"
          >
            📥 Export Contest
          </button>
          <button
            onClick={() => deleteContestData(contestFilter)}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded border border-red-500/30 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 ml-auto"
          >
            🗑 Delete Contest Data
          </button>
        </div>
      )}

      <p className="text-xs text-gray-600 mb-3">
        {filtered.length} shown{showArchived ? " (including archived)" : ""}
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* Violation list */}
        <div className="col-span-2 space-y-2 max-h-[80vh] overflow-y-auto">
          {filtered.map((v) => {
            const isArchived = !!(v as unknown as Record<string, unknown>).archived_at;
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left p-3 rounded border transition-colors ${
                  selected?.id === v.id ? "ring-2 ring-vanguard-accent" : ""
                } ${isArchived ? "opacity-40" : ""} ${severityBg(v.severity)} hover:brightness-110`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs font-bold ${severityColor(v.severity)}`}>
                      {v.severity}
                    </span>
                    <span className="text-sm">{v.summary}</span>
                    {isArchived && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">archived</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(v.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {v.contestant_name || v.contestant_id} · {v.source}
                </p>
              </button>
            );
          })}
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
                      ✓ Confirm
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
