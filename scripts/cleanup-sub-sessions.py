#!/usr/bin/env python3
"""
清理主 Agent 下所有子 Session (subagent + cron)。

操作:
  1. 备份 sessions.json → sessions.json.bak.<timestamp>
  2. 从 sessions.json 中移除所有 subagent 和 cron entry
  3. 删除对应的 JSONL 文件（包括 .deleted.* 归档文件）

用法:
  python3 scripts/cleanup-sub-sessions.py          # dry-run（只预览）
  python3 scripts/cleanup-sub-sessions.py --execute # 实际执行
"""

import json
import os
import sys
from datetime import datetime

AGENT = os.environ.get("OPENCLAW_AGENT", "main")
OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))
SESSIONS_DIR = os.path.join(OPENCLAW_HOME, "agents", AGENT, "sessions")
SESSIONS_JSON = os.path.join(SESSIONS_DIR, "sessions.json")

REMOVE_PREFIXES = (f"agent:{AGENT}:subagent:", f"agent:{AGENT}:cron:")

dry_run = "--execute" not in sys.argv


def main():
    if not os.path.exists(SESSIONS_JSON):
        print(f"Error: {SESSIONS_JSON} not found")
        sys.exit(1)

    with open(SESSIONS_JSON) as f:
        data = json.load(f)

    keep = {}
    remove = {}
    for key, entry in data.items():
        if any(key.startswith(p) for p in REMOVE_PREFIXES):
            remove[key] = entry
        else:
            keep[key] = entry

    # Collect JSONL files to delete
    files_to_delete = []
    all_files = os.listdir(SESSIONS_DIR)
    for key, entry in remove.items():
        sid = entry.get("sessionId", "")
        if not sid:
            continue
        for f in all_files:
            if f.startswith(f"{sid}.jsonl"):
                files_to_delete.append(f)

    # Also find orphaned .deleted.* files not tracked in sessions.json
    tracked_sids = {e.get("sessionId") for e in data.values() if e.get("sessionId")}
    for f in all_files:
        if ".jsonl.deleted." in f:
            sid = f.split(".jsonl")[0]
            if sid not in tracked_sids and f not in files_to_delete:
                files_to_delete.append(f)

    # Report
    print(f"Agent: {AGENT}")
    print(f"Sessions dir: {SESSIONS_DIR}")
    print(f"Mode: {'DRY-RUN (add --execute to apply)' if dry_run else 'EXECUTE'}")
    print()

    print(f"KEEP ({len(keep)}):")
    for k in keep:
        print(f"  {k}")
    print()

    print(f"REMOVE entries ({len(remove)}):")
    for k, entry in remove.items():
        sid = entry.get("sessionId", "?")
        print(f"  {k} -> {sid}")
    print()

    print(f"DELETE files ({len(files_to_delete)}):")
    total_bytes = 0
    for f in sorted(files_to_delete):
        fpath = os.path.join(SESSIONS_DIR, f)
        size = os.path.getsize(fpath) if os.path.exists(fpath) else 0
        total_bytes += size
        print(f"  {f} ({size:,} bytes)")
    print(f"  Total: {total_bytes:,} bytes ({total_bytes / 1024:.1f} KB)")
    print()

    if dry_run:
        print("Dry-run complete. Run with --execute to apply.")
        return

    # Backup sessions.json
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = f"{SESSIONS_JSON}.bak.{ts}"
    with open(backup_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Backup: {backup_path}")

    # Write cleaned sessions.json
    with open(SESSIONS_JSON, "w") as f:
        json.dump(keep, f, indent=2)
    print(f"Updated sessions.json: {len(keep)} entries kept, {len(remove)} removed")

    # Delete files
    deleted_count = 0
    for fname in files_to_delete:
        fpath = os.path.join(SESSIONS_DIR, fname)
        try:
            os.remove(fpath)
            deleted_count += 1
        except OSError as e:
            print(f"  Warning: failed to delete {fname}: {e}")
    print(f"Deleted {deleted_count}/{len(files_to_delete)} files")
    print()
    print("Done.")


if __name__ == "__main__":
    main()
