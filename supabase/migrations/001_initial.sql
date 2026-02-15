-- BDOI Vanguard — Supabase Database Schema
-- Run this as a migration in your Supabase project

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

------------------------------------------------------
-- CONTESTS
------------------------------------------------------
CREATE TABLE contests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

------------------------------------------------------
-- CONTESTANTS
------------------------------------------------------
CREATE TABLE contestants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    -- Overall status computed from violation logs
    status TEXT DEFAULT 'CLEAN' CHECK (status IN ('CLEAN', 'WATCH', 'WARN', 'FLAG', 'BAN')),
    registered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contestants_contest ON contestants(contest_id);
CREATE INDEX idx_contestants_status ON contestants(status);

------------------------------------------------------
-- SESSIONS (agent check-in records)
------------------------------------------------------
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
    contestant_id UUID REFERENCES contestants(id) ON DELETE CASCADE,
    agent_version TEXT,
    os_info TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_sessions_contest ON sessions(contest_id);
CREATE INDEX idx_sessions_contestant ON sessions(contestant_id);
CREATE INDEX idx_sessions_active ON sessions(is_active);

------------------------------------------------------
-- VIOLATION LOGS (all detection events from agents)
------------------------------------------------------
CREATE TABLE violation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id TEXT UNIQUE NOT NULL,
    contest_id TEXT NOT NULL,
    contestant_id TEXT NOT NULL,
    contestant_name TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('CLEAN', 'WATCH', 'WARN', 'FLAG')),
    confidence DOUBLE PRECISION,
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    evidence_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_violations_contest ON violation_logs(contest_id);
CREATE INDEX idx_violations_contestant ON violation_logs(contestant_id);
CREATE INDEX idx_violations_severity ON violation_logs(severity);
CREATE INDEX idx_violations_source ON violation_logs(source);
CREATE INDEX idx_violations_timestamp ON violation_logs(timestamp DESC);

------------------------------------------------------
-- FLAGGED EVENTS (admin-reviewed violations)
------------------------------------------------------
CREATE TABLE flagged_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_id UUID REFERENCES violation_logs(id) ON DELETE CASCADE,
    contest_id TEXT NOT NULL,
    contestant_id TEXT NOT NULL,
    -- Admin verdict
    verdict TEXT CHECK (verdict IN ('CONFIRMED', 'DISMISSED', 'PENDING')) DEFAULT 'PENDING',
    reviewed_by TEXT,
    review_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flagged_verdict ON flagged_events(verdict);
CREATE INDEX idx_flagged_contest ON flagged_events(contest_id);

------------------------------------------------------
-- HEARTBEATS (agent liveness tracking)
------------------------------------------------------
CREATE TABLE heartbeats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    contestant_id TEXT NOT NULL,
    contest_id TEXT NOT NULL,
    received_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_heartbeats_session ON heartbeats(session_id);
CREATE INDEX idx_heartbeats_time ON heartbeats(received_at DESC);

------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
------------------------------------------------------
-- Enable RLS on all tables
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;

-- Agents can INSERT violation logs and heartbeats (using anon key)
CREATE POLICY "Agents can insert violations"
    ON violation_logs FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Agents can insert heartbeats"
    ON heartbeats FOR INSERT
    WITH CHECK (true);

-- Admins (authenticated) can read everything
CREATE POLICY "Admins can read all violations"
    ON violation_logs FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can read all flagged events"
    ON flagged_events FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can read all contests"
    ON contests FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can read all contestants"
    ON contestants FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can read all sessions"
    ON sessions FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can read all heartbeats"
    ON heartbeats FOR SELECT
    USING (auth.role() = 'authenticated');

------------------------------------------------------
-- REALTIME (enable for live dashboard)
------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE violation_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE flagged_events;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE heartbeats;
