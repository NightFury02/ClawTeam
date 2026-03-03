import os
import subprocess
import pytest
import requests

API_URL = os.getenv("CLAWTEAM_API_URL", "http://localhost:3000")
DB_CONTAINER = os.getenv("CLAWTEAM_DB_CONTAINER", "clawteam-postgres")
DB_USER = os.getenv("CLAWTEAM_DB_USER", "clawteam")
DB_NAME = os.getenv("CLAWTEAM_DB_NAME", "clawteam")


@pytest.fixture(scope="session")
def api_url():
    return API_URL


@pytest.fixture(scope="session", autouse=True)
def check_api_health(api_url):
    """Ensure API server is running before any tests."""
    try:
        resp = requests.get(f"{api_url}/health", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        assert data.get("status") == "healthy", f"API unhealthy: {data}"
    except requests.ConnectionError:
        pytest.skip(f"API server not reachable at {api_url}")


def _run_sql(sql: str) -> str:
    """Execute SQL against the ClawTeam database via docker exec."""
    result = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"SQL failed: {result.stderr}")
    return result.stdout


def reset_database():
    """Truncate all business tables, keeping schema and migrations intact."""
    _run_sql(
        "TRUNCATE tasks, capability_index, bots, team_members, users RESTART IDENTITY CASCADE;"
    )


def pytest_addoption(parser):
    parser.addoption(
        "--reset-db", action="store_true", default=False,
        help="Truncate all ClawTeam business data before running tests",
    )


def pytest_configure(config):
    if config.getoption("--reset-db"):
        print("\n[conftest] Resetting ClawTeam database...")
        reset_database()
        print("[conftest] Database reset complete.")
