-- BDOI Vanguard — Migration 002: Auth-linked contestants + admin role
-- Adds auth integration so contestants log in via the agent app
-- and admins manage everything via the dashboard.

-- Admin role check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_users
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

------------------------------------------------------
-- ADMIN USERS (who can access the dashboard)
------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_users"
    ON admin_users FOR ALL
    USING (is_admin());

------------------------------------------------------
-- Update CONTESTANTS to link with auth.users
------------------------------------------------------
ALTER TABLE contestants
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS password_temp TEXT; -- cleartext temp password shown once to admin

CREATE INDEX IF NOT EXISTS idx_contestants_user ON contestants(user_id);

-- Contestants can read their own record
CREATE POLICY "Contestants can read own record"
    ON contestants FOR SELECT
    USING (auth.uid() = user_id);

-- Allow contestant agent to insert violation logs for themselves
DROP POLICY IF EXISTS "Agents can insert violations" ON violation_logs;
CREATE POLICY "Authenticated agents can insert violations"
    ON violation_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow contestant to read own violations
CREATE POLICY "Contestants can read own violations"
    ON violation_logs FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND (
            contestant_id = auth.uid()::text
            OR is_admin()
        )
    );

-- Update heartbeats policy
DROP POLICY IF EXISTS "Agents can insert heartbeats" ON heartbeats;
CREATE POLICY "Authenticated agents can insert heartbeats"
    ON heartbeats FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

------------------------------------------------------
-- SESSIONS: link to auth
------------------------------------------------------
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE POLICY "Contestants can manage own sessions"
    ON sessions FOR ALL
    USING (auth.uid() = user_id OR is_admin());

------------------------------------------------------
-- View: contestant_status (aggregated from violation_logs)
------------------------------------------------------
CREATE OR REPLACE VIEW contestant_status AS
SELECT
    c.id,
    c.name,
    c.email,
    c.contest_id,
    c.user_id,
    c.status,
    c.registered_at,
    COALESCE(v.flag_count, 0) AS flag_count,
    COALESCE(v.warn_count, 0) AS warn_count,
    COALESCE(v.watch_count, 0) AS watch_count,
    COALESCE(v.total_events, 0) AS total_events,
    v.last_event
FROM contestants c
LEFT JOIN (
    SELECT
        contestant_id,
        COUNT(*) FILTER (WHERE severity = 'FLAG') AS flag_count,
        COUNT(*) FILTER (WHERE severity = 'WARN') AS warn_count,
        COUNT(*) FILTER (WHERE severity = 'WATCH') AS watch_count,
        COUNT(*) AS total_events,
        MAX(timestamp) AS last_event
    FROM violation_logs
    GROUP BY contestant_id
) v ON c.id::text = v.contestant_id;
