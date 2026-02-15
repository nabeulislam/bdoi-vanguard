-- Add contestant_name to sessions table for display
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contestant_name TEXT;

-- Allow contestants to insert/update their own sessions
DROP POLICY IF EXISTS "Contestants can insert own sessions" ON sessions;
CREATE POLICY "Contestants can insert own sessions" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Contestants can update own sessions" ON sessions;
CREATE POLICY "Contestants can update own sessions" ON sessions
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can read all sessions" ON sessions;
CREATE POLICY "Admins can read all sessions" ON sessions
  FOR SELECT TO authenticated
  USING (true);
