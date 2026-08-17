#!/usr/bin/env bash
#
# Idempotently ensure a local PostgreSQL instance is installed, running, and
# provisioned with the eXharness test database.
#
# Works on Debian/Ubuntu in two environments:
#   - local sandbox (already has PostgreSQL, just needs a start + provision)
#   - GitHub Actions ubuntu-latest runner (installs PostgreSQL via apt)
#
# Must run as root (local sandbox) or via `sudo` (CI runner).
set -euo pipefail

DB_USER="${EXHARNESS_TEST_PG_USER:-exharness}"
DB_PASSWORD="${EXHARNESS_TEST_PG_PASSWORD:-exharness}"
DB_NAME="${EXHARNESS_TEST_PG_DB:-exharness_test}"
PG_HOST="${EXHARNESS_TEST_PG_HOST:-127.0.0.1}"
PG_PORT="${EXHARNESS_TEST_PG_PORT:-5432}"

if [ "$(id -u)" != "0" ]; then
  echo "ensure-postgres: must run as root (or via sudo)" >&2
  exit 1
fi

# Install PostgreSQL if the client or the cluster tooling is missing.
if ! command -v psql >/dev/null 2>&1 || ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "ensure-postgres: installing PostgreSQL..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq postgresql postgresql-contrib
fi

# Start every configured cluster (idempotent — already-online clusters are skipped).
if command -v pg_ctlcluster >/dev/null 2>&1; then
  for version in $(pg_lsclusters | awk 'NR > 1 {print $1}'); do
    pg_ctlcluster "$version" main start >/dev/null 2>&1 || true
  done
else
  service postgresql start 2>/dev/null || true
fi

# Wait until the server accepts local connections.
ready=0
for _ in $(seq 1 30); do
  if su postgres -c "pg_isready -h ${PG_HOST} -p ${PG_PORT}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  echo "ensure-postgres: PostgreSQL did not become ready in time" >&2
  exit 1
fi

# Provision the role (idempotent).
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'\"" | grep -q 1; then
  su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB\""
fi

# Provision the database (idempotent).
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'\"" | grep -q 1; then
  su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}\""
fi

echo "ensure-postgres: PostgreSQL ready at ${PG_HOST}:${PG_PORT} (db=${DB_NAME}, user=${DB_USER})"
