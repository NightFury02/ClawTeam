#!/usr/bin/env python3
"""Reset ClawTeam database - truncate all business data, keep schema."""

import subprocess
import os

DB_CONTAINER = os.getenv("CLAWTEAM_DB_CONTAINER", "clawteam-postgres")
DB_USER = os.getenv("CLAWTEAM_DB_USER", "clawteam")
DB_NAME = os.getenv("CLAWTEAM_DB_NAME", "clawteam")

SQL_COUNTS = "SELECT 'bots' as t, count(*) FROM bots UNION ALL SELECT 'tasks', count(*) FROM tasks;"
SQL_TRUNCATE = "TRUNCATE tasks, capability_index, bots, team_members, users RESTART IDENTITY CASCADE;"


def run_sql(sql):
    result = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-c", sql],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SQL failed: {result.stderr.strip()}")
    return result.stdout.strip()


def main():
    print("Before reset:")
    print(run_sql(SQL_COUNTS))

    run_sql(SQL_TRUNCATE)

    print("\nAfter reset:")
    print(run_sql(SQL_COUNTS))
    print("\nDone.")


if __name__ == "__main__":
    main()
