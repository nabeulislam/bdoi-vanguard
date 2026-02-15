import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types matching our database schema
export interface Contest {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface Contestant {
  id: string;
  contest_id: string;
  name: string;
  email: string | null;
  status: "CLEAN" | "WATCH" | "WARN" | "FLAG" | "BAN";
  registered_at: string;
}

export interface ViolationLog {
  id: string;
  event_id: string;
  contest_id: string;
  contestant_id: string;
  contestant_name: string | null;
  timestamp: string;
  source: string;
  severity: "CLEAN" | "WATCH" | "WARN" | "FLAG";
  confidence: number;
  summary: string;
  details: Record<string, unknown>;
  evidence_hash: string;
  created_at: string;
}

export interface FlaggedEvent {
  id: string;
  violation_id: string;
  contest_id: string;
  contestant_id: string;
  verdict: "CONFIRMED" | "DISMISSED" | "PENDING";
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type Severity = "CLEAN" | "WATCH" | "WARN" | "FLAG" | "BAN";

export function severityColor(severity: Severity): string {
  switch (severity) {
    case "CLEAN":
      return "text-vanguard-green";
    case "WATCH":
      return "text-vanguard-yellow";
    case "WARN":
      return "text-orange-500";
    case "FLAG":
      return "text-vanguard-red";
    case "BAN":
      return "text-red-600";
    default:
      return "text-gray-400";
  }
}

export function severityBg(severity: Severity): string {
  switch (severity) {
    case "CLEAN":
      return "bg-green-500/10 border-green-500/30";
    case "WATCH":
      return "bg-yellow-500/10 border-yellow-500/30";
    case "WARN":
      return "bg-orange-500/10 border-orange-500/30";
    case "FLAG":
      return "bg-red-500/10 border-red-500/30";
    case "BAN":
      return "bg-red-700/10 border-red-700/30";
    default:
      return "bg-gray-500/10 border-gray-500/30";
  }
}
