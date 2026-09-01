FROM postgres:16-alpine

COPY docker/local/postgres-init/01-supabase-compat.sql /docker-entrypoint-initdb.d/01-supabase-compat.sql
