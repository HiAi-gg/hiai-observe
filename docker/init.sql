-- Database (hiai_observe) and user (observe) are created by POSTGRES_DB/POSTGRES_USER env vars.
-- This script only grants schema-level permissions.
GRANT ALL ON SCHEMA public TO observe;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO observe;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO observe;
