-- Wave 0: Schema migrations for hiai-observe completion
-- Applied: 2026-06-06

-- RBAC: projects.api_role column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS api_role VARCHAR(20) DEFAULT 'member';
ALTER TABLE projects ADD CONSTRAINT ck_projects_api_role CHECK (api_role IN ('admin','member','readonly'));

-- Incidents: severity + description
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'minor';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS description TEXT;

-- gRPC monitor fields
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS host VARCHAR(255);
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS port INTEGER;
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS tls BOOLEAN DEFAULT false;
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);
