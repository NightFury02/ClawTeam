#!/usr/bin/env python3
"""
SimBot Task Originator

Continuously generates and delegates tasks so the TaskRouter has pending
tasks to poll and route. Used for manual testing of the TaskRouter with
a real OpenClaw instance.

Two modes:

  Mode A — Target your real OpenClaw bot (for TaskRouter testing):
    python originate.py --target-bot-id <your-bot-id>

  Mode B — Self-contained (registers its own target bot):
    python originate.py

Mode A is the primary use case: the originator delegates tasks to your
real bot. The TaskRouter picks them up and routes to your OpenClaw sessions.

Options:
    --target-bot-id ID   Delegate tasks to an existing bot (your real OpenClaw bot)
    --interval N         Seconds between scenario runs (default: from config, typically 10)
    --once               Run one scenario and exit
    --scenario NAME      Only run a specific scenario by name
    --count N            Stop after N scenarios (0 = unlimited)
    --config PATH        Custom config YAML
    --reset-db           Reset database before starting
    --list-scenarios     List available scenarios and exit
    --list-bots          Query API for registered bots and exit

Examples:
    # Test TaskRouter with your real OpenClaw bot:
    python originate.py --target-bot-id abc-123-def --once

    # Continuous task generation every 5 seconds:
    python originate.py --target-bot-id abc-123-def --interval 5

    # Only sub-task chain scenarios, 3 rounds:
    python originate.py --target-bot-id abc-123-def --scenario sub_task_chain --count 3

    # Self-contained mode (registers its own target):
    python originate.py --once

    # List registered bots to find your bot ID:
    python originate.py --list-bots
"""

import sys
import os
import time
import random
import signal
import argparse
import logging
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
import yaml
from simbot import SimBot
from simbot.strategy import FixedStrategy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("originate")


def parse_args():
    parser = argparse.ArgumentParser(
        description="SimBot Task Originator — generate tasks for TaskRouter testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--target-bot-id", default=None,
                        help="Delegate tasks to this existing bot ID (your real OpenClaw bot)")
    parser.add_argument("--config", default=None, help="Originator config YAML path")
    parser.add_argument("--interval", type=float, default=None,
                        help="Seconds between scenario runs (overrides config)")
    parser.add_argument("--once", action="store_true", help="Run one scenario and exit")
    parser.add_argument("--scenario", default=None, help="Only run a specific scenario by name")
    parser.add_argument("--count", type=int, default=0, help="Stop after N scenarios (0 = unlimited)")
    parser.add_argument("--reset-db", action="store_true", help="Reset database before starting")
    parser.add_argument("--list-scenarios", action="store_true", help="List available scenarios and exit")
    parser.add_argument("--list-bots", action="store_true", help="Query API for registered bots and exit")
    return parser.parse_args()


def load_config(config_path: str | None) -> dict:
    path = config_path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "config", "originator.yaml"
    )
    return yaml.safe_load(open(path).read())


def register_bot(bot_cfg: dict, api_url: str, invite_code: str) -> SimBot:
    """Register a SimBot from config."""
    bot = SimBot(
        name=bot_cfg["name"],
        email=bot_cfg.get("email", f"{bot_cfg['name'].lower()}@test.com"),
        capabilities=bot_cfg.get("capabilities", []),
        strategy=FixedStrategy({}),
        api_url=api_url,
        invite_code=invite_code,
    )
    bot.register()
    return bot


def list_bots(api_url: str) -> None:
    """Query the API for registered bots and print them."""
    # Try the bots listing endpoint
    try:
        resp = requests.get(f"{api_url}/api/v1/bots", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            bots = data.get("data", {}).get("bots", data.get("data", []))
            if isinstance(bots, list):
                print(f"\nRegistered bots ({len(bots)}):\n")
                for bot in bots:
                    bot_id = bot.get("id", "?")
                    name = bot.get("name", "?")
                    caps = [c.get("name", "?") for c in bot.get("capabilities", [])]
                    print(f"  {name}")
                    print(f"    ID:           {bot_id}")
                    print(f"    Capabilities: {', '.join(caps) or '(none)'}")
                    print()
                return
        # Try capability search as fallback
        resp2 = requests.get(f"{api_url}/api/v1/capabilities", timeout=5)
        if resp2.status_code == 200:
            data = resp2.json()
            print(f"\nAPI responded but /bots endpoint returned {resp.status_code}.")
            print("Try checking the dashboard or database directly for bot IDs.")
            return
    except requests.exceptions.ConnectionError:
        print(f"\nCannot connect to API at {api_url}")
        print("Make sure the API server is running: npm run dev:api")
        return
    except Exception as e:
        print(f"\nError querying bots: {e}")


def pick_scenario(scenarios: list[dict], filter_name: str | None = None) -> dict:
    """Pick a scenario based on weights, or by name if filter is set."""
    if filter_name:
        for s in scenarios:
            if s["name"] == filter_name:
                return s
        raise ValueError(f"Scenario '{filter_name}' not found. Available: {[s['name'] for s in scenarios]}")

    weights = [s.get("weight", 1) for s in scenarios]
    return random.choices(scenarios, weights=weights, k=1)[0]


def run_scenario(
    scenario: dict,
    originator: SimBot,
    target_bot_id: str,
    target_name: str,
    scenario_count: int,
) -> list[dict]:
    """Execute a scenario: delegate task(s) in sequence."""
    tasks_info = scenario.get("tasks", [])
    delegated = []
    parent_task_id = None
    parent_session_key = None

    sender_session_key = f"agent:{originator.name.lower()}:originate:{scenario_count}"

    logger.info(f"--- Scenario: {scenario['name']} ({len(tasks_info)} task(s)) ---")

    for i, task_cfg in enumerate(tasks_info):
        task_type = task_cfg.get("type", "new")
        capability = task_cfg["capability"]
        parameters = dict(task_cfg.get("parameters", {}))

        # For sub-task, reference the parent task
        parent_id_arg = None
        if task_type == "sub-task" and parent_task_id:
            parent_id_arg = parent_task_id
            # Set targetSessionKey so TaskRouter knows where to route
            if parent_session_key:
                parameters["targetSessionKey"] = parent_session_key

            # Delay before sub-task
            delay = task_cfg.get("delay", 3)
            logger.info(f"  Waiting {delay}s before {task_type}...")
            time.sleep(delay)

        try:
            result = originator.delegate_task(
                to_bot_id=target_bot_id,
                prompt=task_cfg.get("prompt", f"Execute {capability} task"),
                capability=capability,
                parameters=parameters,
                task_type=task_type,
                sender_session_key=sender_session_key,
                parent_task_id=parent_id_arg,
                title=task_cfg.get("title"),
            )

            task_data = result.get("data", result)
            task_id = (
                task_data.get("taskId")
                or task_data.get("task", {}).get("id")
                or task_data.get("id")
            )

            # After the first "new" task, record it as parent for subsequent sub-tasks
            if task_type == "new" and i == 0:
                parent_task_id = task_id
                # Simulate an executor session key
                # In real flow, the executor sets this on accept.
                # Here we generate one so sub-tasks have
                # a targetSessionKey for the TaskRouter to route to.
                parent_session_key = f"agent:{target_name.lower()}:sub:{uuid.uuid4().hex[:8]}"

            delegated.append({
                "task_id": task_id,
                "type": task_type,
                "capability": capability,
                "parent_task_id": parent_id_arg,
                "target_session_key": parameters.get("targetSessionKey"),
            })

            logger.info(
                f"  [{task_type.upper()}] Delegated: task_id={task_id}, "
                f"capability={capability}, to_bot={target_bot_id}"
            )

        except Exception as e:
            logger.error(f"  Failed to delegate {task_type} task: {e}")
            delegated.append({"type": task_type, "error": str(e)})

    return delegated


def main():
    args = parse_args()
    config = load_config(args.config)

    api_url = config.get("api_url", "http://localhost:3000")
    invite_code = config.get("invite_code", "TEST2024")
    interval = args.interval or config.get("interval", 10)
    scenarios = config.get("scenarios", [])

    # --list-bots: query and exit
    if args.list_bots:
        list_bots(api_url)
        return

    # --list-scenarios: print and exit
    if args.list_scenarios:
        print(f"\nAvailable scenarios ({len(scenarios)}):\n")
        for s in scenarios:
            tasks = s.get("tasks", [])
            types = " → ".join(t.get("type", "new") for t in tasks)
            print(f"  {s['name']} (weight={s.get('weight', 1)})")
            print(f"    Flow: {types}")
            caps = ", ".join(t.get("capability", "?") for t in tasks)
            print(f"    Capabilities: {caps}")
            print()
        return

    # Reset DB if requested
    if args.reset_db:
        from conftest import reset_database
        logger.info("Resetting database...")
        reset_database()
        logger.info("Database reset complete.")

    # Register the originator bot (always needed — this is the sender)
    logger.info("Registering originator bot...")
    originator = register_bot(config["originator"], api_url, invite_code)

    # Determine target bot
    # Priority: CLI --target-bot-id > config target_bot_id > self-contained mode
    configured_target = config.get("target_bot_id", "")
    effective_target = args.target_bot_id or configured_target or None

    if effective_target:
        # Mode A: target an existing bot (user's real OpenClaw bot)
        target_bot_id = effective_target
        target_name = "external"
        source = "CLI flag" if args.target_bot_id else "config file"
        logger.info(f"Targeting existing bot: {target_bot_id} (from {source})")
    else:
        # Mode B: register our own target bot (self-contained testing)
        logger.info("Registering target bot (self-contained mode)...")
        target = register_bot(config["target"], api_url, invite_code)
        target_bot_id = target.bot_id
        target_name = target.name
        logger.info(f"Target bot registered: {target_name} (id={target_bot_id})")

    # Print info
    print()
    print("=" * 64)
    print("  SimBot Task Originator")
    print("=" * 64)
    print()
    print(f"  Originator:  {originator.name} (id={originator.bot_id})")
    if args.target_bot_id:
        print(f"  Target:      external bot (id={target_bot_id}) [CLI flag]")
        print(f"               → Tasks go to YOUR bot, TaskRouter routes them")
    elif configured_target:
        print(f"  Target:      external bot (id={target_bot_id}) [config file]")
        print(f"               → Tasks go to YOUR bot, TaskRouter routes them")
    else:
        print(f"  Target:      {target_name} (id={target_bot_id})")
        print(f"               → Self-contained mode (no real OpenClaw needed)")
    print(f"  Interval:    {interval}s")
    print()

    scenario_names = [s["name"] for s in scenarios]
    print(f"  Scenarios:   {', '.join(scenario_names)}")
    if args.scenario:
        print(f"  Filter:      {args.scenario}")
    if args.count > 0:
        print(f"  Max rounds:  {args.count}")
    print()

    if effective_target:
        print("  ┌─────────────────────────────────────────────────────┐")
        print("  │  TaskRouter Testing Mode                           │")
        print("  │                                                    │")
        print("  │  Originator → API (pending) → TaskRouter → OpenClaw│")
        print("  │                                                    │")
        print("  │  Make sure TaskRouter is running:                  │")
        print("  │  CLAWTEAM_API_KEY=xxx npm run dev:router           │")
        print("  └─────────────────────────────────────────────────────┘")
    else:
        print("  Tasks will be created as 'pending' in the API.")
        print("  Use 'serve.py' in another terminal to auto-process them,")
        print("  or let the TaskRouter route them to OpenClaw.")
    print()
    print("  Press Ctrl+C to stop.")
    print("-" * 64)
    print()

    # Graceful shutdown
    running = True

    def handle_signal(sig, frame):
        nonlocal running
        running = False
        print("\nStopping...")

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Main loop
    scenario_count = 0
    total_tasks = 0

    while running:
        scenario_count += 1

        scenario = pick_scenario(scenarios, args.scenario)
        results = run_scenario(scenario, originator, target_bot_id, target_name, scenario_count)
        total_tasks += len([r for r in results if "error" not in r])

        logger.info(f"Scenario #{scenario_count} complete. Total tasks delegated: {total_tasks}")

        if args.once:
            break

        if args.count > 0 and scenario_count >= args.count:
            logger.info(f"Reached --count={args.count}, stopping.")
            break

        try:
            time.sleep(interval)
        except (KeyboardInterrupt, SystemExit):
            break

    print(f"\nDone. Scenarios run: {scenario_count}, Tasks delegated: {total_tasks}")


if __name__ == "__main__":
    main()
