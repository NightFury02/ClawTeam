#!/usr/bin/env python3
"""
SimBot Chain Workflow Test — Session Tracking & Resume

Tests the new task lifecycle with session persistence and API-direct resume:
  1. Delegate NEW task → executor accepts + track_session → processing
  2. Executor calls need-human-input → waiting_for_input
  3. Verify task_sessions — GET /tasks/:id/sessions confirms persistence
  4. Resume via API Server — POST /tasks/:id/resume (Dashboard direct call)
  5. Session recovery test — query task_sessions by botId, verify mapping

Modes:
  Self-contained (default):
    Registers both originator + executor SimBots.
    Executor polls, accepts, tracks session, marks waiting, etc.
    No external Gateway/OpenClaw needed — pure API Server test.

  Target-bot mode (--target-bot-id):
    Delegates to a real bot. Skips accept/track-session steps
    (Gateway handles those). Only tests resume + sessions query.

Prerequisites:
  - API server running:  npm run dev:api

Usage:
    # Self-contained mode (default):
    python chain.py --timeout 30

    # Target-bot mode (needs Gateway + OpenClaw):
    python chain.py --target-bot-id <bot-id> --timeout 120
"""

import sys
import os
import argparse
import logging
import json
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import yaml
from simbot import SimBot
from simbot.strategy import FixedStrategy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("chain")

TOTAL_STEPS = 5


def parse_args():
    parser = argparse.ArgumentParser(
        description="SimBot Chain — session tracking & resume test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--target-bot-id", default=None,
                        help="Target bot ID (skip self-contained executor)")
    parser.add_argument("--config", default=None,
                        help="Originator config YAML path")
    parser.add_argument("--timeout", type=float, default=30,
                        help="Max seconds to wait per step (default: 30)")
    parser.add_argument("--poll-interval", type=float, default=2,
                        help="Seconds between status polls (default: 2)")
    parser.add_argument("--capability", default="code_review",
                        help="Capability to request (default: code_review)")
    return parser.parse_args()


def load_config(config_path: str | None) -> dict:
    path = config_path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "config", "originator.yaml"
    )
    return yaml.safe_load(open(path).read())


def make_bot(config: dict, name: str, email: str, capabilities: list[dict] | None = None) -> SimBot:
    """Create and register a SimBot from config."""
    bot = SimBot(
        name=name,
        email=email,
        capabilities=capabilities or [],
        strategy=FixedStrategy({}),
        api_url=config.get("api_url", "http://localhost:3000"),
        invite_code=config.get("invite_code", "TEST2024"),
        user_api_key=config.get("user_api_key"),
    )
    bot.register()
    return bot


def extract_task_id(result: dict) -> str | None:
    """Extract task ID from various API response shapes."""
    task_data = result.get("data", result)
    return (
        task_data.get("taskId")
        or task_data.get("task", {}).get("id")
        or task_data.get("id")
    )


def print_task_summary(label: str, task: dict):
    """Print a formatted task summary."""
    print(f"\n  {'─' * 56}")
    print(f"  {label}")
    print(f"  {'─' * 56}")
    print(f"  Task ID:            {task.get('id', '?')}")
    print(f"  Status:             {task.get('status', '?')}")
    print(f"  Type:               {task.get('type', 'new')}")
    if task.get("capability"):
        print(f"  Capability:         {task['capability']}")
    if task.get("executorSessionKey"):
        print(f"  Executor Session:   {task['executorSessionKey']}")
    if task.get("senderSessionKey"):
        print(f"  Sender Session:     {task['senderSessionKey']}")
    if task.get("result"):
        result_str = json.dumps(task["result"], ensure_ascii=False)
        if len(result_str) > 80:
            result_str = result_str[:80] + "..."
        print(f"  Result:             {result_str}")
    if task.get("error"):
        print(f"  Error:              {task['error']}")


# ── Self-contained flow ──────────────────────────────────────

def run_self_contained(config: dict, args):
    """Full self-contained test: originator + executor SimBots, no Gateway."""

    bot_cfg = config.get("originator", {})

    # Register originator
    logger.info("Registering originator bot...")
    originator = make_bot(
        config,
        name=bot_cfg.get("name", "ChainOriginator"),
        email=bot_cfg.get("email", "originator@test.com"),
    )

    # Register executor
    logger.info("Registering executor bot...")
    executor = make_bot(
        config,
        name="ChainExecutor",
        email="executor@test.com",
        capabilities=[{"name": args.capability}],
    )

    sender_session_key = f"agent:{originator.name.lower()}:chain:{uuid.uuid4().hex[:8]}"
    exec_session_key = f"agent:{executor.name.lower()}:subagent:{uuid.uuid4().hex[:8]}"

    # Print header
    print()
    print("=" * 64)
    print("  SimBot Chain — Session Tracking & Resume Test")
    print("  Mode: self-contained")
    print("=" * 64)
    print()
    print(f"  Originator:   {originator.name} (id={originator.bot_id})")
    print(f"  Executor:     {executor.name} (id={executor.bot_id})")
    print(f"  Capability:   {args.capability}")
    print(f"  Timeout:      {args.timeout}s per step")
    print(f"  Steps:        delegate → wait_for_input → verify sessions → resume → recovery")
    print()
    print("-" * 64)

    # ── Step 1: Delegate + Accept + Track Session ────────────

    print(f"\n[Step 1/{TOTAL_STEPS}] Delegate NEW task → executor accepts + track_session...")

    result = originator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Review the codebase for security issues in routing module",
        capability=args.capability,
        parameters={"description": "Chain test: session tracking"},
        task_type="new",
        sender_session_key=sender_session_key,
        title="Chain test: session tracking & resume",
    )

    task_id = extract_task_id(result)
    if not task_id:
        print(f"  ERROR: Failed to get task ID from response: {result}")
        sys.exit(1)
    print(f"  Delegated: task_id={task_id}")

    # Executor polls and accepts
    print(f"  Executor polling for pending tasks...")
    deadline = time.time() + args.timeout
    found = False
    while time.time() < deadline:
        tasks = executor.poll_tasks()
        matching = [t for t in tasks if t["id"] == task_id]
        if matching:
            found = True
            break
        time.sleep(args.poll_interval)

    if not found:
        print(f"  ERROR: Executor did not find task {task_id} within timeout")
        sys.exit(1)

    executor.accept_task(task_id, executor_session_key=exec_session_key)
    print(f"  Accepted: executor_session_key={exec_session_key}")

    executor.start_task(task_id)
    print(f"  Started: task is now processing")

    # Track sessions (simulates Gateway /gateway/track-session persistence)
    executor.track_session(task_id, exec_session_key, executor.bot_id, role="executor")
    originator.track_session(task_id, sender_session_key, originator.bot_id, role="sender")
    print(f"  Tracked session: executor ({executor.bot_id})")
    print(f"  Tracked session: sender ({originator.bot_id})")

    print_task_summary("Step 1 Complete: Delegate + Accept + Track", executor.get_task(task_id).get("data", {}))

    # ── Step 2: Executor marks waiting_for_input ─────────────

    print(f"\n[Step 2/{TOTAL_STEPS}] Executor calls need-human-input → waiting_for_input...")

    executor.wait_for_input(
        task_id,
        reason="Need additional context about the security requirements",
        target_bot_id=originator.bot_id,
    )

    # Verify status changed
    task = originator.wait_for_task(
        task_id,
        timeout_s=args.timeout,
        poll_interval_s=args.poll_interval,
        terminal_statuses=("waiting_for_input",),
    )
    assert task["status"] == "waiting_for_input", (
        f"Expected waiting_for_input, got {task['status']}"
    )
    print(f"  Task status: {task['status']}")
    print_task_summary("Step 2 Complete: waiting_for_input", task)

    # ── Step 3: Verify task_sessions persistence ─────────────

    print(f"\n[Step 3/{TOTAL_STEPS}] Verify task_sessions — GET /tasks/:id/sessions...")

    sessions = originator.get_task_sessions(task_id)
    print(f"  Sessions found: {len(sessions)}")
    for s in sessions:
        print(f"    botId={s.get('botId')}  role={s.get('role')}  sessionKey={s.get('sessionKey')}")

    assert len(sessions) >= 2, (
        f"Expected at least 2 sessions (sender + executor), got {len(sessions)}"
    )
    assert any(s.get("botId") == executor.bot_id for s in sessions), (
        f"Executor bot {executor.bot_id} not found in task_sessions"
    )
    assert any(s.get("botId") == originator.bot_id for s in sessions), (
        f"Originator bot {originator.bot_id} not found in task_sessions"
    )

    print(f"\n  {'─' * 56}")
    print(f"  Step 3 Complete: task_sessions verified")
    print(f"  {'─' * 56}")
    print(f"  Executor session: FOUND")
    print(f"  Sender session:   FOUND")

    # ── Step 4: Resume via API Server ────────────────────────

    print(f"\n[Step 4/{TOTAL_STEPS}] Resume via API Server — POST /tasks/:id/resume...")

    originator.resume_task(task_id, input_text="Here is the info you requested: focus on XSS and CSRF")
    print(f"  Resume sent with input text")

    # Wait for task to return to processing
    task = originator.wait_for_task(
        task_id,
        timeout_s=args.timeout,
        poll_interval_s=args.poll_interval,
        terminal_statuses=("processing", "completed", "failed"),
    )
    assert task["status"] == "processing", (
        f"Expected processing after resume, got {task['status']}"
    )
    print(f"  Task status after resume: {task['status']}")
    print_task_summary("Step 4 Complete: Resumed via API Server", task)

    # ── Step 5: Session Recovery Test ────────────────────────

    print(f"\n[Step 5/{TOTAL_STEPS}] Session recovery — query task_sessions by botId...")

    # Simulate Gateway restart: in-memory sessionTracker is lost.
    # Recovery: query task_sessions by taskId, find sessionKey for executor's botId.
    sessions = executor.get_task_sessions(task_id)
    executor_sessions = [s for s in sessions if s.get("botId") == executor.bot_id]

    assert len(executor_sessions) == 1, (
        f"Expected 1 executor session, got {len(executor_sessions)}"
    )
    recovered_key = executor_sessions[0].get("sessionKey")
    assert recovered_key == exec_session_key, (
        f"Session key mismatch: expected {exec_session_key}, got {recovered_key}"
    )
    print(f"  Recovered session key: {recovered_key}")
    print(f"  Matches original:      {recovered_key == exec_session_key}")

    # Also verify sender session recovery
    sender_sessions = [s for s in sessions if s.get("botId") == originator.bot_id]
    assert len(sender_sessions) == 1, (
        f"Expected 1 sender session, got {len(sender_sessions)}"
    )
    recovered_sender_key = sender_sessions[0].get("sessionKey")
    assert recovered_sender_key == sender_session_key, (
        f"Sender session key mismatch: expected {sender_session_key}, got {recovered_sender_key}"
    )
    print(f"  Recovered sender key:  {recovered_sender_key}")

    print(f"\n  {'─' * 56}")
    print(f"  Step 5 Complete: Session recovery verified")
    print(f"  {'─' * 56}")

    # ── Cleanup: executor completes the task ─────────────────

    print(f"\n  Executor completing task...")
    executor.complete_task(
        task_id,
        status="completed",
        result={"summary": "Security review completed, no critical issues found"},
    )

    task = originator.wait_for_task(
        task_id,
        timeout_s=args.timeout,
        poll_interval_s=args.poll_interval,
    )
    assert task["status"] == "completed", (
        f"Expected completed, got {task['status']}"
    )

    # ── Summary ──────────────────────────────────────────────

    print()
    print("=" * 64)
    print("  Chain Workflow Complete — ALL STEPS PASSED")
    print("=" * 64)
    print()
    print(f"  Task ID:             {task_id}")
    print(f"  Step 1 (delegate):   OK — executor accepted + track_session")
    print(f"  Step 2 (wait):       OK — waiting_for_input")
    print(f"  Step 3 (sessions):   OK — {len(sessions)} sessions persisted")
    print(f"  Step 4 (resume):     OK — resumed via API Server")
    print(f"  Step 5 (recovery):   OK — session keys recovered from DB")
    print(f"  Cleanup (complete):  OK — task completed")
    print()
    print(f"  Originator:  {originator.bot_id}")
    print(f"  Executor:    {executor.bot_id}")
    print(f"  Sender key:  {sender_session_key}")
    print(f"  Exec key:    {exec_session_key}")
    print()


# ── Target-bot flow ──────────────────────────────────────────

def run_target_bot(config: dict, args, target_bot_id: str):
    """Target-bot mode: delegate to real bot, test resume + sessions query."""

    bot_cfg = config.get("originator", {})

    logger.info("Registering originator bot...")
    originator = make_bot(
        config,
        name=bot_cfg.get("name", "ChainOriginator"),
        email=bot_cfg.get("email", "originator@test.com"),
    )

    sender_session_key = f"agent:{originator.name.lower()}:chain:{uuid.uuid4().hex[:8]}"

    # Print header
    print()
    print("=" * 64)
    print("  SimBot Chain — Session Tracking & Resume Test")
    print("  Mode: target-bot")
    print("=" * 64)
    print()
    print(f"  Originator:   {originator.name} (id={originator.bot_id})")
    print(f"  Target Bot:   {target_bot_id}")
    print(f"  Capability:   {args.capability}")
    print(f"  Timeout:      {args.timeout}s per step")
    print()
    print("-" * 64)

    # ── Step 1: Delegate task (Gateway handles accept/track) ─

    print(f"\n[Step 1/{TOTAL_STEPS}] Delegate NEW task to target bot...")

    result = originator.delegate_task(
        to_bot_id=target_bot_id,
        prompt="Review the codebase for security issues in routing module",
        capability=args.capability,
        parameters={"description": "Chain test: session tracking (target-bot mode)"},
        task_type="new",
        sender_session_key=sender_session_key,
        title="Chain test: session tracking & resume",
    )

    task_id = extract_task_id(result)
    if not task_id:
        print(f"  ERROR: Failed to get task ID from response: {result}")
        sys.exit(1)
    print(f"  Delegated: task_id={task_id}")

    # Track sender session
    originator.track_session(task_id, sender_session_key, originator.bot_id, role="sender")
    print(f"  Tracked sender session")

    # Wait for the real bot to process → it should eventually go to
    # waiting_for_input or completed. We accept either for target-bot mode.
    print(f"  Waiting for task to reach waiting_for_input or completed (timeout={args.timeout}s)...")
    try:
        task = originator.wait_for_task(
            task_id,
            timeout_s=args.timeout,
            poll_interval_s=args.poll_interval,
            terminal_statuses=("waiting_for_input", "processing", "completed", "failed"),
        )
    except TimeoutError as e:
        print(f"\n  TIMEOUT: {e}")
        sys.exit(1)

    print_task_summary("Step 1 Complete: Task delegated", task)

    # ── Step 2: Check if waiting_for_input (may skip) ────────

    print(f"\n[Step 2/{TOTAL_STEPS}] Check task status...")
    if task["status"] == "waiting_for_input":
        print(f"  Task is waiting_for_input — will test resume")
    else:
        print(f"  Task status is '{task['status']}' — skip waiting_for_input test")

    # ── Step 3: Verify task_sessions ─────────────────────────

    print(f"\n[Step 3/{TOTAL_STEPS}] Verify task_sessions...")

    sessions = originator.get_task_sessions(task_id)
    print(f"  Sessions found: {len(sessions)}")
    for s in sessions:
        print(f"    botId={s.get('botId')}  role={s.get('role')}  sessionKey={s.get('sessionKey')}")

    # At minimum, we should have the sender session we tracked
    assert any(s.get("botId") == originator.bot_id for s in sessions), (
        f"Originator bot {originator.bot_id} not found in task_sessions"
    )
    print(f"  Sender session: FOUND")

    # ── Step 4: Resume if waiting ────────────────────────────

    print(f"\n[Step 4/{TOTAL_STEPS}] Resume via API Server...")

    if task["status"] == "waiting_for_input":
        originator.resume_task(task_id, input_text="Here is the info you requested")
        print(f"  Resume sent")

        task = originator.wait_for_task(
            task_id,
            timeout_s=args.timeout,
            poll_interval_s=args.poll_interval,
            terminal_statuses=("processing", "completed", "failed"),
        )
        print(f"  Task status after resume: {task['status']}")
    else:
        print(f"  Skipped — task was not in waiting_for_input state")

    # ── Step 5: Session recovery ─────────────────────────────

    print(f"\n[Step 5/{TOTAL_STEPS}] Session recovery test...")

    sessions = originator.get_task_sessions(task_id)
    sender_sessions = [s for s in sessions if s.get("botId") == originator.bot_id]
    assert len(sender_sessions) >= 1, (
        f"Expected sender session, got {len(sender_sessions)}"
    )
    recovered_key = sender_sessions[0].get("sessionKey")
    assert recovered_key == sender_session_key, (
        f"Sender key mismatch: expected {sender_session_key}, got {recovered_key}"
    )
    print(f"  Recovered sender key: {recovered_key}")
    print(f"  Matches original:     {recovered_key == sender_session_key}")

    # ── Summary ──────────────────────────────────────────────

    print()
    print("=" * 64)
    print("  Chain Workflow Complete (target-bot mode)")
    print("=" * 64)
    print()
    print(f"  Task ID:             {task_id}")
    print(f"  Final status:        {task['status']}")
    print(f"  Sessions persisted:  {len(sessions)}")
    print(f"  Sender recovery:     OK")
    print()


# ── Main ─────────────────────────────────────────────────────

def main():
    args = parse_args()
    config = load_config(args.config)

    # Resolve target bot
    configured_target = config.get("target_bot_id", "")
    target_bot_id = args.target_bot_id or configured_target or None

    if target_bot_id:
        run_target_bot(config, args, target_bot_id)
    else:
        run_self_contained(config, args)


if __name__ == "__main__":
    main()
