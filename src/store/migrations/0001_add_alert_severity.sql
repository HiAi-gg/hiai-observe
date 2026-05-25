-- Add severity column to alerts table
-- Values: "critical", "warning", "info"
-- Default: "warning" (preserves existing behavior)

ALTER TABLE alerts ADD COLUMN severity text NOT NULL DEFAULT 'warning';
