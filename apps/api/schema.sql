CREATE TABLE IF NOT EXISTS workspace_auth_transactions (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id text PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  profile jsonb NOT NULL,
  csrf text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_sessions_expiry ON workspace_sessions(expires_at);
CREATE TABLE IF NOT EXISTS workspace_admin_operations (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  kind text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  object_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_operations_actor ON workspace_admin_operations(issuer, subject, created_at);
