-- Multi-host monitoring: hostId columns, GPU stats, host info, top processes

-- Add host_id to container_stats (default "local" for existing rows)
ALTER TABLE container_stats ADD COLUMN IF NOT EXISTS host_id text NOT NULL DEFAULT 'local';
CREATE INDEX IF NOT EXISTS container_stats_host_idx ON container_stats(host_id);

-- Add host_id and top_processes to host_stats
ALTER TABLE host_stats ADD COLUMN IF NOT EXISTS host_id text NOT NULL DEFAULT 'local';
ALTER TABLE host_stats ADD COLUMN IF NOT EXISTS top_processes jsonb DEFAULT '[]';
CREATE INDEX IF NOT EXISTS host_stats_host_idx ON host_stats(host_id);

-- GPU stats table
CREATE TABLE IF NOT EXISTS gpu_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id text NOT NULL,
  gpu_index integer NOT NULL,
  utilization_percent real NOT NULL,
  memory_used_mb real NOT NULL,
  memory_total_mb real NOT NULL,
  temperature_c real,
  collected_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gpu_stats_host_time_idx ON gpu_stats(host_id, collected_at);

-- Host info table (one row per host, upserted)
CREATE TABLE IF NOT EXISTS host_info (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id text NOT NULL UNIQUE,
  os_name text,
  kernel_version text,
  cpu_model text,
  core_count integer,
  architecture text,
  uptime_seconds bigint,
  collected_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_info_host_idx ON host_info(host_id);
