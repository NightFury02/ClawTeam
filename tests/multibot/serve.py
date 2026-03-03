#!/usr/bin/env python3
"""
SimBot Background Server

Start simulated bots that stay alive and respond to tasks from your real OpenClaw Agent.

Usage:
    python serve.py                      # Start all bots from config/bots.yaml
    python serve.py --config custom.yaml # Use custom config
    python serve.py --reset-db           # Reset database before starting
    python serve.py --poll-interval 5    # Poll every 5 seconds (default: 3)

What happens:
    1. (Optional) Reset database
    2. Register all SimBots from config
    3. Print bot info (IDs, capabilities) so you know who to interact with
    4. Start polling loop - SimBots auto-accept and complete incoming tasks
    5. Keep running until Ctrl+C

Then in another terminal, use your OpenClaw Agent:
    openclaw
    > /clawteam
    > "Analyze this data: [10, 20, 30, 40, 50]"
"""

import sys
import os
import time
import signal
import argparse
import logging

# Ensure simbot is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from simbot import BotPool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("serve")


def parse_args():
    parser = argparse.ArgumentParser(description="SimBot Background Server")
    parser.add_argument("--config", default=None, help="Bot config YAML path")
    parser.add_argument("--reset-db", action="store_true", help="Reset database before starting")
    parser.add_argument("--poll-interval", type=float, default=3.0, help="Seconds between polls (default: 3)")
    return parser.parse_args()


def main():
    args = parse_args()

    config_path = args.config or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "config", "bots.yaml"
    )

    # Reset DB if requested
    if args.reset_db:
        from conftest import reset_database
        logger.info("Resetting database...")
        reset_database()
        logger.info("Database reset complete.")

    # Load and register bots
    pool = BotPool(config_path=config_path)
    pool.setup()

    # Print bot info
    print()
    print("=" * 64)
    print("  SimBot Background Server")
    print("=" * 64)
    print()
    print("  Registered bots:")
    print()
    for bot in pool.bots:
        caps = ", ".join(c["name"] for c in bot.capabilities)
        print(f"    {bot.name}")
        print(f"      ID:           {bot.bot_id}")
        print(f"      Capabilities: {caps}")
        print()
    print("-" * 64)
    print("  Bots are now polling for tasks.")
    print("  Open another terminal and use your OpenClaw Agent to interact.")
    print()
    print("  Example:")
    print("    openclaw")
    print('    > /clawteam')
    print('    > "Analyze data [10, 20, 30, 40, 50]"')
    print()
    print("  Press Ctrl+C to stop.")
    print("-" * 64)
    print()

    # Graceful shutdown
    running = True
    def handle_signal(sig, frame):
        nonlocal running
        running = False
        print("\nShutting down...")
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Polling loop
    poll_count = 0
    tasks_processed = 0
    while running:
        poll_count += 1
        results = pool.process_all_pending()

        for bot_name, bot_results in results.items():
            for r in bot_results:
                tasks_processed += 1
                status_icon = "+" if r["status"] == "completed" else "!"
                logger.info(
                    f"[{status_icon}] {bot_name} processed task {r['task_id']} -> {r['status']}"
                )

        try:
            time.sleep(args.poll_interval)
        except (KeyboardInterrupt, SystemExit):
            break

    print(f"\nStopped. Polls: {poll_count}, Tasks processed: {tasks_processed}")
    pool.teardown()


if __name__ == "__main__":
    main()
