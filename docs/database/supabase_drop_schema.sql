-- WARNING: THIS WILL DELETE ALL TABLES AND DATA IN THE PUBLIC SCHEMA!
-- Use this ONLY if you want to start completely fresh in Supabase.

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Restore default permissions
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
