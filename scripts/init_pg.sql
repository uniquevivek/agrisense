-- Initialize PostgreSQL credentials for local development
-- Sets password for the default postgres role and ensures DB exists
ALTER USER postgres WITH PASSWORD 'postgres';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'agri_sense') THEN
    PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE agri_sense');
  END IF;
END
$$ LANGUAGE plpgsql;