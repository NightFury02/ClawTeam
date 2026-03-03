#!/usr/bin/env python3
"""
Multi-Bot Test Runner

Usage:
    python run_all.py                    # Run all scenarios (with DB reset)
    python run_all.py --no-reset         # Run without resetting DB
    python run_all.py -k basic           # Run only basic delegate test
    python run_all.py -v                 # Verbose output
"""

import sys
import os
import subprocess


def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))

    # Separate our flags from pytest args
    our_args = sys.argv[1:]
    no_reset = "--no-reset" in our_args
    pytest_extra = [a for a in our_args if a != "--no-reset"]

    # Build pytest args
    args = [
        sys.executable, "-m", "pytest",
        os.path.join(test_dir, "scenarios"),
        f"--rootdir={test_dir}",
        "--timeout=60",
        "-v",
    ]
    if not no_reset:
        args.append("--reset-db")

    args.extend(pytest_extra)

    # Ensure simbot is importable
    env = os.environ.copy()
    env["PYTHONPATH"] = test_dir + os.pathsep + env.get("PYTHONPATH", "")

    print("=" * 60)
    print("  ClawTeam Multi-Bot Test Runner")
    print(f"  API: {os.getenv('CLAWTEAM_API_URL', 'http://localhost:3000')}")
    print("=" * 60)
    print()

    result = subprocess.run(args, env=env)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
