"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, ViolationLog, severityColor, severityBg } from "@/lib/supabase";

export default function ContestantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<ViolationLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from("violation_logs")
      .select("*")
      .eq("contestant_id", id)
      .order("timestamp", { ascending: false });

    if (data && data.length > 0) {
      setName(data[0].contestant_name || id);
      setViolations(data);
    }
    setLoading(false);
  }

  const filtered = violations.filter((v) => {
    if (filter === "all") return true;
    if (filter === "flagged") return v.severity === "FLAG" || v.severity === "WARN";
    return v.severity === filter;
  });

  const stats = {
    total: violations.length,
    flags: violations.filter((v) => v.severity === "FLAG").length,
    warns: violations.filter((v) => v.severity === "WARN").length,
    watches: violations.filter((v) => v.severity === "WATCH").length,
    clean: violations.filter((v) => v.severity === "CLEAN").length,
  };

  function exportUser(format: "csv" | "json") {
    const data = filtered;
    let content: string;
    let mime: string;
    let ext: string;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mime = "application/json";
      ext = "json";
    } else {
      const headers = [
        "timestamp", "severity", "source", "summary",
        "confidence", "evidence_hash", "details",
      ];
      const rows = data.map((v) =>
        headers
          .map((h) => {
            let val = String((v as unknown as Record<string, unknown>)[h] || "");
            if (h === "details") val = JSON.stringify(v.details);
            return '"' + val.replace(/"/g, '""') + '"';
          })
          .join(",")
      );
      content = headers.join(",") + "\n" + rows.join("\n");
      mime = "text/csv";
      ext = "csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contestant-${name || id}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteUserData() {
    if (
      !confirm(
        `Permanently delete ALL violation logs for ${name || id}? This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    await supabase.from("violation_logs").delete().eq("contestant_id", id);
    await supabase.from("flagged_events").delete().eq("contestant_id", id);
    setDeleting(false);
    router.push("/contestants");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/contestants")}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold">{name}</h1>
          <span className="text-xs text-gray-500 font-mono">{id}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportUser("csv")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => exportUser("json")}
            className="px-3 py-1.5 text-xs rounded border border-vanguard-border text-gray-400 hover:text-white hover:border-vanguard-accent transition-colors"
          >
            📥 Export JSON
          </button>
          <button
            onClick={deleteUserData}
            disabled={deleting}
            className="px-3 py-1.5 text-xs rounded border border-red-500/30 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
          >
            🗑 Delete All Data
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Events", value: stats.total, color: "text-white" },
          { label: "Flags", value: stats.flags, color: "text-red-400" },
          { label: "Warnings", value: stats.warns, color: "text-orange-400" },
          { label: "Watches", value: stats.watches, color: "text-yellow-400" },
          { label: "Clean", value: stats.clean, color: "text-green-400" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 text-center"
          >
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {["all", "flagged", "FLAG", "WARN", "WATCH", "CLEAN"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filter === f
                ? "bg-vanguard-accent/20 border-vanguard-accent text-vanguard-accent"
                : "border-vanguard-border text-gray-500 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f === "flagged" ? "⚠ Flagged Only" : f}
          </button>
        ))}
        <span className="text-xs text-gray-600 ml-2">{filtered.length} events</span>
      </div>

      {/* Event list + detail */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
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
                  <span
                    className={`font-mono text-xs font-bold ${severityColor(v.severity)}`}
                  >
                    {v.severity}
                  </span>
                  <span className="text-sm">{v.summary}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(v.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{v.source} · conf {(v.confidence * 100).toFixed(0)}%</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No events match filters
            </p>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-vanguard-card border border-vanguard-border rounded-lg p-4 sticky top-6 h-fit">
          {selected ? (
            <div>
              <h3 className="font-semibold mb-3">Event Details</h3>
              <div className="space-y-2 text-sm">
                <Row label="Severity" value={selected.severity} className={severityColor(selected.severity)} />
                <Row label="Source" value={selected.source} />
                <Row label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
                <Row label="Time" value={new Date(selected.timestamp).toLocaleString()} />
                <Row label="Hash" value={selected.evidence_hash.slice(0, 16) + "…"} />
              </div>
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-1">Evidence</p>
                <pre className="bg-black/50 p-3 rounded text-xs overflow-auto max-h-48 text-green-400">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">
              Select an event to inspect
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={className || "text-white"}>{value}</span>
    </div>
  );
}
