-- Fix sessions table: remove FK to contestants (agent sends auth user UUID, not contestants table UUID)
-- Also add contestant_name and archived_at for violation management

-- Drop the FK constraint on contestant_id
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_contestant_id_fkey;

-- Change contestant_id to TEXT (matches how agent sends it)
ALTER TABLE sessions ALTER COLUMN contestant_id TYPE TEXT USING contestant_id::TEXT;

-- Add contestant_name column
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contestant_name TEXT;

-- Add archived_at to violation_logs for server-side archiving
ALTER TABLE violation_logs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_violations_archived ON violation_logs(archived_at);

-- Also make contest_id on sessions TEXT to match (agent sends UUID as string)
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_contest_id_fkey;
ALTER TABLE sessions ALTER COLUMN contest_id TYPE TEXT USING contest_id::TEXT;

-- RLS: allow authenticated users to insert/update/select/delete sessions
DROP POLICY IF EXISTS "Admins can read all sessions" ON sessions;
DROP POLICY IF EXISTS "Contestants can insert own sessions" ON sessions;
DROP POLICY IF EXISTS "Contestants can update own sessions" ON sessions;

CREATE POLICY "Anyone can insert sessions" ON sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update sessions" ON sessions
  FOR UPDATE USING (true);

CREATE POLICY "Authenticated can read sessions" ON sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can delete sessions" ON sessions
  FOR DELETE TO authenticated USING (true);

-- RLS: allow admins to update (archive) and delete violations
DROP POLICY IF EXISTS "Admins can read all violations" ON violation_logs;
CREATE POLICY "Admins can read all violations" ON violation_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update violations" ON violation_logs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete violations" ON violation_logs
  FOR DELETE TO authenticated USING (true);
