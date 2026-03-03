#!/usr/bin/env python3
"""
OpenClaw Session Status Inspector

查看所有 agent 的 session 状态：活跃、已归档、孤立（orphaned）。
对已归档 session 显示详细信息：归档时间、会话内容摘要、token 使用等。

Usage:
    python3 scripts/session-status.py                    # 概览
    python3 scripts/session-status.py --detail           # 包含已归档 session 详情
    python3 scripts/session-status.py --agent main       # 只看指定 agent
    python3 scripts/session-status.py --archived         # 只看已归档 session
    python3 scripts/session-status.py --orphaned         # 只看孤立 session
    python3 scripts/session-status.py --session <uuid>   # 查看指定 session 的对话内容
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Defaults ──────────────────────────────────────────────────────────────────

OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", Path.home() / ".openclaw"))
AGENTS_DIR = OPENCLAW_HOME / "agents"

# ── Colors ────────────────────────────────────────────────────────────────────

class C:
    """ANSI colors (disabled if not a TTY)."""
    _enabled = sys.stdout.isatty()

    RESET  = "\033[0m"  if _enabled else ""
    BOLD   = "\033[1m"  if _enabled else ""
    DIM    = "\033[2m"  if _enabled else ""
    RED    = "\033[31m" if _enabled else ""
    GREEN  = "\033[32m" if _enabled else ""
    YELLOW = "\033[33m" if _enabled else ""
    BLUE   = "\033[34m" if _enabled else ""
    CYAN   = "\033[36m" if _enabled else ""
    WHITE  = "\033[37m" if _enabled else ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def human_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB"):
        if nbytes < 1024:
            return f"{nbytes:.0f}{unit}" if unit == "B" else f"{nbytes:.1f}{unit}"
        nbytes /= 1024
    return f"{nbytes:.1f}GB"


def human_age(ts_iso: str | None) -> str:
    """Convert ISO timestamp to human-readable age like '2h30m ago'."""
    if not ts_iso:
        return "?"
    try:
        # Handle format like 2026-02-10T09-52-42.801Z (dashes in time part)
        normalized = ts_iso.replace("Z", "+00:00")
        # Try standard ISO first
        try:
            dt = datetime.fromisoformat(normalized)
        except ValueError:
            # Handle the file-name format: 2026-02-10T09-52-42.801Z
            parts = ts_iso.rstrip("Z").split("T")
            if len(parts) == 2:
                time_part = parts[1]
                # Replace first two dashes in time with colons: 09-52-42.801 → 09:52:42.801
                segments = time_part.split("-")
                if len(segments) >= 3:
                    time_fixed = f"{segments[0]}:{segments[1]}:{'-'.join(segments[2:])}"
                    dt = datetime.fromisoformat(f"{parts[0]}T{time_fixed}+00:00")
                else:
                    return ts_iso
            else:
                return ts_iso

        now = datetime.now(timezone.utc)
        delta = now - dt
        total_seconds = int(delta.total_seconds())
        if total_seconds < 0:
            return "future?"

        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60

        if days > 0:
            return f"{days}d{hours}h ago"
        elif hours > 0:
            return f"{hours}h{minutes}m ago"
        elif minutes > 0:
            return f"{minutes}m ago"
        else:
            return "just now"
    except Exception:
        return ts_iso


def ts_to_local(ts_iso: str | None) -> str:
    """Convert ISO timestamp to local time string."""
    if not ts_iso:
        return "?"
    try:
        normalized = ts_iso.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(normalized)
        except ValueError:
            parts = ts_iso.rstrip("Z").split("T")
            if len(parts) == 2:
                segments = parts[1].split("-")
                if len(segments) >= 3:
                    time_fixed = f"{segments[0]}:{segments[1]}:{'-'.join(segments[2:])}"
                    dt = datetime.fromisoformat(f"{parts[0]}T{time_fixed}+00:00")
                else:
                    return ts_iso
            else:
                return ts_iso
        local_dt = dt.astimezone()
        return local_dt.strftime("%m-%d %H:%M:%S")
    except Exception:
        return ts_iso


def epoch_ms_to_local(epoch_ms: int) -> str:
    try:
        dt = datetime.fromtimestamp(epoch_ms / 1000)
        return dt.strftime("%m-%d %H:%M:%S")
    except Exception:
        return str(epoch_ms)


def epoch_ms_to_age(epoch_ms: int) -> str:
    try:
        dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = now - dt
        total_seconds = int(delta.total_seconds())
        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60
        if days > 0:
            return f"{days}d{hours}h ago"
        elif hours > 0:
            return f"{hours}h{minutes}m ago"
        elif minutes > 0:
            return f"{minutes}m ago"
        else:
            return "just now"
    except Exception:
        return "?"


# ── JSONL Parsing ─────────────────────────────────────────────────────────────

def parse_session_jsonl(filepath: Path, max_messages: int = 5) -> dict[str, Any]:
    """Parse a session JSONL file and extract summary info."""
    info: dict[str, Any] = {
        "session_id": None,
        "created_at": None,
        "cwd": None,
        "model": None,
        "provider": None,
        "thinking_level": None,
        "messages": [],       # list of {role, text_preview, timestamp}
        "total_lines": 0,
        "message_count": 0,
        "tool_calls": 0,
        "file_size": 0,
    }

    try:
        info["file_size"] = filepath.stat().st_size
    except OSError:
        pass

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                info["total_lines"] += 1
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                obj_type = obj.get("type")

                if obj_type == "session":
                    info["session_id"] = obj.get("id")
                    info["created_at"] = obj.get("timestamp")
                    info["cwd"] = obj.get("cwd")

                elif obj_type == "model_change":
                    info["model"] = obj.get("modelId")
                    info["provider"] = obj.get("provider")

                elif obj_type == "thinking_level_change":
                    info["thinking_level"] = obj.get("thinkingLevel")

                elif obj_type == "message":
                    msg = obj.get("message", {})
                    role = msg.get("role", "?")
                    ts = obj.get("timestamp")

                    if role in ("user", "assistant"):
                        info["message_count"] += 1
                        content = msg.get("content", "")
                        text_preview = _extract_text_preview(content)
                        if len(info["messages"]) < max_messages:
                            info["messages"].append({
                                "role": role,
                                "text": text_preview,
                                "timestamp": ts,
                            })

                    # Count tool use in assistant messages
                    if role == "assistant":
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "tool_use":
                                    info["tool_calls"] += 1

    except Exception as e:
        info["error"] = str(e)

    return info


def _extract_text_preview(content: Any, max_len: int = 120) -> str:
    """Extract text preview from message content (str or list of blocks)."""
    if isinstance(content, str):
        return content[:max_len].replace("\n", " ")
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")[:max_len].replace("\n", " ")
    return ""


# ── Data Collection ───────────────────────────────────────────────────────────

def collect_agent_data(agent_dir: Path) -> dict[str, Any]:
    """Collect session data for one agent."""
    agent_name = agent_dir.name
    sessions_dir = agent_dir / "sessions"

    data: dict[str, Any] = {
        "agent": agent_name,
        "active": {},      # key → info from sessions.json
        "archived": [],    # list of {uuid, archived_at, filepath, ...}
        "orphaned": [],    # JSONL files not in sessions.json and not .deleted
    }

    # 1. Load sessions.json (active sessions)
    sessions_json = sessions_dir / "sessions.json"
    active_session_ids: set[str] = set()
    if sessions_json.exists():
        try:
            with open(sessions_json, "r") as f:
                sj = json.load(f)
            for key, val in sj.items():
                sid = val.get("sessionId", "")
                active_session_ids.add(sid)
                data["active"][key] = {
                    "sessionId": sid,
                    "updatedAt": val.get("updatedAt"),
                    "model": val.get("model"),
                    "provider": val.get("modelProvider"),
                    "inputTokens": val.get("inputTokens", 0),
                    "outputTokens": val.get("outputTokens", 0),
                    "totalTokens": val.get("totalTokens", 0),
                    "contextTokens": val.get("contextTokens", 0),
                    "channel": val.get("lastChannel") or val.get("channel"),
                }
        except Exception:
            pass

    if not sessions_dir.exists():
        return data

    # 2. Scan for .deleted files (archived sessions)
    # 3. Scan for orphaned .jsonl files
    for entry in sessions_dir.iterdir():
        name = entry.name
        if ".deleted." in name:
            # Archived session
            uuid = name.split(".jsonl.deleted.")[0] if ".jsonl.deleted." in name else name
            archived_at = name.split(".deleted.")[-1] if ".deleted." in name else None
            data["archived"].append({
                "uuid": uuid,
                "archived_at": archived_at,
                "filepath": entry,
                "file_size": entry.stat().st_size if entry.exists() else 0,
            })
        elif name.endswith(".jsonl") and name != "sessions.json":
            uuid = name.replace(".jsonl", "")
            if uuid not in active_session_ids:
                data["orphaned"].append({
                    "uuid": uuid,
                    "filepath": entry,
                    "file_size": entry.stat().st_size if entry.exists() else 0,
                    "mtime": entry.stat().st_mtime if entry.exists() else 0,
                })

    # Sort
    data["archived"].sort(key=lambda x: x.get("archived_at", ""), reverse=True)
    data["orphaned"].sort(key=lambda x: x.get("mtime", 0), reverse=True)

    return data


# ── Display Functions ─────────────────────────────────────────────────────────

def print_header(text: str):
    width = 78
    print()
    print(f"{C.BOLD}{C.CYAN}{'═' * width}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}  {text}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}{'═' * width}{C.RESET}")


def print_subheader(text: str):
    print(f"\n{C.BOLD}{C.YELLOW}── {text} {'─' * max(0, 74 - len(text))}{C.RESET}")


def print_overview(all_data: list[dict]):
    """Print summary table of all agents."""
    print_header("OpenClaw Session Status Overview")

    # Table header
    print(f"\n  {C.BOLD}{'Agent':<10} {'Active':>7} {'Archived':>9} {'Orphaned':>9} {'Total JSONL':>12} {'Disk Usage':>11}{C.RESET}")
    print(f"  {'─' * 10} {'─' * 7} {'─' * 9} {'─' * 9} {'─' * 12} {'─' * 11}")

    total_active = 0
    total_archived = 0
    total_orphaned = 0
    total_jsonl = 0
    total_disk = 0

    for d in all_data:
        n_active = len(d["active"])
        n_archived = len(d["archived"])
        n_orphaned = len(d["orphaned"])
        n_jsonl = n_active + n_archived + n_orphaned
        disk = sum(a["file_size"] for a in d["archived"]) + sum(o["file_size"] for o in d["orphaned"])

        total_active += n_active
        total_archived += n_archived
        total_orphaned += n_orphaned
        total_jsonl += n_jsonl
        total_disk += disk

        active_color = C.GREEN if n_active > 0 else C.DIM
        archived_color = C.YELLOW if n_archived > 0 else C.DIM
        orphaned_color = C.RED if n_orphaned > 0 else C.DIM

        print(
            f"  {C.BOLD}{d['agent']:<10}{C.RESET}"
            f" {active_color}{n_active:>7}{C.RESET}"
            f" {archived_color}{n_archived:>9}{C.RESET}"
            f" {orphaned_color}{n_orphaned:>9}{C.RESET}"
            f" {n_jsonl:>12}"
            f" {human_size(disk):>11}"
        )

    print(f"  {'─' * 10} {'─' * 7} {'─' * 9} {'─' * 9} {'─' * 12} {'─' * 11}")
    print(
        f"  {C.BOLD}{'TOTAL':<10}{C.RESET}"
        f" {C.GREEN}{total_active:>7}{C.RESET}"
        f" {C.YELLOW}{total_archived:>9}{C.RESET}"
        f" {C.RED}{total_orphaned:>9}{C.RESET}"
        f" {total_jsonl:>12}"
        f" {human_size(total_disk):>11}"
    )

    print(f"\n  {C.DIM}Active   = in sessions.json (currently tracked by gateway){C.RESET}")
    print(f"  {C.DIM}Archived = .deleted.* files (formally recycled with timestamp){C.RESET}")
    print(f"  {C.DIM}Orphaned = .jsonl files not in sessions.json (lost on gateway restart){C.RESET}")


def print_active_sessions(data: dict):
    """Print active sessions for an agent."""
    if not data["active"]:
        print(f"  {C.DIM}(none){C.RESET}")
        return

    for key, info in sorted(data["active"].items(), key=lambda x: x[1].get("updatedAt", 0), reverse=True):
        sid = info["sessionId"][:12]
        updated = epoch_ms_to_local(info["updatedAt"]) if info["updatedAt"] else "?"
        age = epoch_ms_to_age(info["updatedAt"]) if info["updatedAt"] else "?"
        model = info.get("model", "?")
        tokens = info.get("totalTokens", 0)
        channel = info.get("channel", "?")

        # Classify session key type
        if ":subagent:" in key:
            key_type = f"{C.BLUE}subagent{C.RESET}"
        elif ":cron:" in key:
            key_type = f"{C.YELLOW}cron{C.RESET}"
        elif key.endswith(":main") or key == "main":
            key_type = f"{C.GREEN}main{C.RESET}"
        else:
            key_type = key

        print(
            f"  {key_type:<20} {C.DIM}sid={sid}…{C.RESET}"
            f"  updated={C.WHITE}{updated}{C.RESET} ({age})"
            f"  model={model}  tokens={tokens}  ch={channel}"
        )


def print_archived_sessions(data: dict, detail: bool = False):
    """Print archived sessions for an agent."""
    if not data["archived"]:
        print(f"  {C.DIM}(none){C.RESET}")
        return

    for i, arc in enumerate(data["archived"]):
        uuid_short = arc["uuid"][:12]
        archived_at = arc.get("archived_at", "?")
        local_time = ts_to_local(archived_at)
        age = human_age(archived_at)
        size = human_size(arc["file_size"])

        print(
            f"  {C.RED}●{C.RESET} {uuid_short}…"
            f"  {C.DIM}archived={C.RESET}{C.WHITE}{local_time}{C.RESET} ({age})"
            f"  size={size}"
        )

        if detail:
            info = parse_session_jsonl(arc["filepath"], max_messages=3)
            created = ts_to_local(info.get("created_at"))
            model = info.get("model", "?")
            n_msgs = info.get("message_count", 0)
            n_tools = info.get("tool_calls", 0)

            print(f"    {C.DIM}created={created}  model={model}  messages={n_msgs}  tool_calls={n_tools}{C.RESET}")

            if info.get("messages"):
                for msg in info["messages"]:
                    role = msg["role"]
                    text = msg["text"]
                    role_color = C.CYAN if role == "user" else C.GREEN
                    print(f"    {role_color}{role}:{C.RESET} {C.DIM}{text}{C.RESET}")
            print()


def print_orphaned_sessions(data: dict, detail: bool = False, limit: int = 10):
    """Print orphaned sessions for an agent."""
    orphaned = data["orphaned"]
    if not orphaned:
        print(f"  {C.DIM}(none){C.RESET}")
        return

    total = len(orphaned)
    showing = orphaned[:limit]
    total_size = sum(o["file_size"] for o in orphaned)

    print(f"  {C.DIM}Showing {len(showing)}/{total} orphaned sessions (total disk: {human_size(total_size)}){C.RESET}")
    print()

    for o in showing:
        uuid_short = o["uuid"][:12]
        size = human_size(o["file_size"])
        mtime = datetime.fromtimestamp(o["mtime"]).strftime("%m-%d %H:%M") if o["mtime"] else "?"

        print(
            f"  {C.YELLOW}○{C.RESET} {uuid_short}…"
            f"  {C.DIM}last_modified={C.RESET}{mtime}"
            f"  size={size}"
        )

        if detail:
            info = parse_session_jsonl(o["filepath"], max_messages=2)
            created = ts_to_local(info.get("created_at"))
            model = info.get("model", "?")
            n_msgs = info.get("message_count", 0)

            print(f"    {C.DIM}created={created}  model={model}  messages={n_msgs}{C.RESET}")

            if info.get("messages"):
                for msg in info["messages"][:1]:  # Just first message for orphans
                    text = msg["text"]
                    print(f"    {C.CYAN}user:{C.RESET} {C.DIM}{text}{C.RESET}")
            print()

    if total > limit:
        print(f"  {C.DIM}... and {total - limit} more (use --orphaned --detail to see all){C.RESET}")


def print_session_detail(session_uuid: str):
    """Print full conversation for a specific session UUID."""
    # Search across all agents
    found = None
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        sessions_dir = agent_dir / "sessions"
        if not sessions_dir.exists():
            continue
        for entry in sessions_dir.iterdir():
            if session_uuid in entry.name:
                found = (agent_dir.name, entry)
                break
        if found:
            break

    if not found:
        print(f"{C.RED}Session '{session_uuid}' not found across any agent.{C.RESET}")
        sys.exit(1)

    agent_name, filepath = found
    is_archived = ".deleted." in filepath.name

    status = f"{C.RED}ARCHIVED{C.RESET}" if is_archived else f"{C.GREEN}ACTIVE{C.RESET}"
    print_header(f"Session Detail — {agent_name}/{filepath.stem[:20]}…")
    print(f"  Agent:  {agent_name}")
    print(f"  File:   {filepath.name}")
    print(f"  Status: {status}")
    print(f"  Size:   {human_size(filepath.stat().st_size)}")

    info = parse_session_jsonl(filepath, max_messages=999)

    print(f"  Created:   {ts_to_local(info.get('created_at'))}")
    print(f"  Model:     {info.get('provider', '?')}/{info.get('model', '?')}")
    print(f"  Thinking:  {info.get('thinking_level', '?')}")
    print(f"  CWD:       {info.get('cwd', '?')}")
    print(f"  Messages:  {info.get('message_count', 0)}")
    print(f"  Tool uses: {info.get('tool_calls', 0)}")
    print(f"  JSONL lines: {info.get('total_lines', 0)}")

    if is_archived:
        archived_at = filepath.name.split(".deleted.")[-1]
        print(f"  Archived:  {ts_to_local(archived_at)} ({human_age(archived_at)})")

    print_subheader("Conversation")

    for msg in info.get("messages", []):
        role = msg["role"]
        text = msg["text"]
        ts = ts_to_local(msg.get("timestamp"))

        if role == "user":
            print(f"\n  {C.CYAN}{C.BOLD}[USER]{C.RESET} {C.DIM}{ts}{C.RESET}")
            # Print full text, wrapped
            for line in text.split("\n"):
                print(f"  {line}")
        elif role == "assistant":
            print(f"\n  {C.GREEN}{C.BOLD}[ASSISTANT]{C.RESET} {C.DIM}{ts}{C.RESET}")
            for line in text.split("\n"):
                print(f"  {line}")

    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="OpenClaw Session Status Inspector — 查看所有 agent 的 session 回收状况",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          概览所有 agent
  %(prog)s --detail                 包含已归档 session 的详细信息
  %(prog)s --agent main             只看 main agent
  %(prog)s --agent main --detail    main agent 详细信息
  %(prog)s --archived               只看已归档 session
  %(prog)s --orphaned               只看孤立 session
  %(prog)s --session 035a2a34       查看指定 session 的对话内容
  %(prog)s --json                   JSON 输出 (可供程序使用)
        """,
    )
    parser.add_argument("--agent", "-a", help="Filter by agent name")
    parser.add_argument("--detail", "-d", action="store_true", help="Show detailed info for archived/orphaned sessions")
    parser.add_argument("--archived", action="store_true", help="Only show archived sessions")
    parser.add_argument("--orphaned", action="store_true", help="Only show orphaned sessions")
    parser.add_argument("--session", "-s", help="Show full conversation for a specific session UUID (prefix match)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--openclaw-home", default=str(OPENCLAW_HOME), help=f"OpenClaw home dir (default: {OPENCLAW_HOME})")

    args = parser.parse_args()

    agents_dir = Path(args.openclaw_home) / "agents"

    if not agents_dir.exists():
        print(f"{C.RED}Agents directory not found: {agents_dir}{C.RESET}")
        sys.exit(1)

    # Single session detail mode
    if args.session:
        print_session_detail(args.session)
        return

    # Collect data for all (or filtered) agents
    all_data: list[dict] = []
    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        if args.agent and agent_dir.name != args.agent:
            continue
        data = collect_agent_data(agent_dir)
        all_data.append(data)

    if not all_data:
        print(f"{C.RED}No agents found{' matching ' + args.agent if args.agent else ''}.{C.RESET}")
        sys.exit(1)

    # JSON output mode
    if args.json:
        output = []
        for d in all_data:
            agent_out = {
                "agent": d["agent"],
                "active_count": len(d["active"]),
                "archived_count": len(d["archived"]),
                "orphaned_count": len(d["orphaned"]),
                "active": d["active"],
                "archived": [
                    {
                        "uuid": a["uuid"],
                        "archived_at": a["archived_at"],
                        "file_size": a["file_size"],
                    }
                    for a in d["archived"]
                ],
                "orphaned": [
                    {
                        "uuid": o["uuid"],
                        "file_size": o["file_size"],
                    }
                    for o in d["orphaned"][:50]  # Limit for sanity
                ],
            }
            output.append(agent_out)
        print(json.dumps(output, indent=2, default=str))
        return

    # ── Display ───────────────────────────────────────────────────────────

    # Always show overview first (unless filtering to archived/orphaned only)
    if not args.archived and not args.orphaned:
        print_overview(all_data)

    # Per-agent details
    for d in all_data:
        agent = d["agent"]

        if not args.archived and not args.orphaned:
            print_subheader(f"{agent} — Active Sessions ({len(d['active'])})")
            print_active_sessions(d)

        if not args.orphaned:
            if d["archived"] or not args.archived:
                print_subheader(f"{agent} — Archived Sessions ({len(d['archived'])})")
                print_archived_sessions(d, detail=args.detail)

        if not args.archived:
            if d["orphaned"] or not args.orphaned:
                n = len(d["orphaned"])
                if n > 0 or not args.orphaned:
                    print_subheader(f"{agent} — Orphaned Sessions ({n})")
                    limit = 999 if args.detail else 10
                    print_orphaned_sessions(d, detail=args.detail, limit=limit)

    print()


if __name__ == "__main__":
    main()
