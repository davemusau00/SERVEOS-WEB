CREATE TABLE IF NOT EXISTS approvals(
  token TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  target TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS approvals_active ON approvals(initiator_id,permission,expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_role_active ON staff(role,active);
PRAGMA user_version = 2;
