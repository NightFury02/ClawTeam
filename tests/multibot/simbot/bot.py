"""
SimBot - Simulated ClawTeam Bot.

Wraps ClawTeam API calls (via requests) to simulate a bot that can:
- Register with the platform
- Delegate tasks (as sender)
- Poll, accept, start, complete tasks (as executor)
"""

import os
import time
import uuid
import logging
from typing import Any

import requests

from .strategy import Strategy, StrategyResult

logger = logging.getLogger("simbot")


class SimBot:
    """A simulated ClawTeam bot."""

    def __init__(
        self,
        name: str,
        email: str,
        capabilities: list[dict],
        strategy: Strategy,
        api_url: str | None = None,
        invite_code: str = "TEST2024",
        user_api_key: str | None = None,
    ):
        self.name = name
        self.email = email
        self.capabilities = capabilities
        self.strategy = strategy
        self.api_url = api_url or os.getenv("CLAWTEAM_API_URL", "http://localhost:3000")
        self.invite_code = invite_code
        self.user_api_key = user_api_key
        self.bot_id: str | None = None
        self.api_key: str | None = None
        # Track session keys per task for routing tests
        self.session_keys: dict[str, str] = {}

    # ── Registration ────────────────────────────────────────

    def register(self) -> dict:
        """Register this bot with ClawTeam Platform.
        Appends a timestamp suffix to ensure unique names across test runs.
        """
        unique_name = f"{self.name}-{int(time.time() * 1000) % 10_000_000}"
        headers = {}
        if self.user_api_key:
            headers["Authorization"] = f"Bearer {self.user_api_key}"
        resp = requests.post(
            f"{self.api_url}/api/v1/bots/register",
            json={
                "name": unique_name,
                "ownerEmail": self.email,
                "inviteCode": self.invite_code,
                "capabilities": self.capabilities,
            },
            headers=headers or None,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        payload = data.get("data", data)
        self.bot_id = payload.get("botId") or payload.get("bot", {}).get("id")
        self.api_key = payload.get("apiKey")

        logger.info(f"[{self.name}] Registered: bot_id={self.bot_id}")
        return data

    # ── Auth header ─────────────────────────────────────────

    def _headers(self, json: bool = True) -> dict:
        key = self.api_key or self.user_api_key
        h = {"Authorization": f"Bearer {key}"}
        if json:
            h["Content-Type"] = "application/json"
        return h

    # ── Task Delegation (委托方) ────────────────────────────

    def delegate_task(
        self,
        to_bot_id: str,
        prompt: str,
        capability: str | None = None,
        parameters: dict | None = None,
        task_type: str = "new",
        sender_session_key: str | None = None,
        parent_task_id: str | None = None,
        title: str | None = None,
    ) -> dict:
        """Delegate a task to another bot."""
        body: dict[str, Any] = {
            "toBotId": to_bot_id,
            "prompt": prompt,
            "parameters": parameters or {},
            "type": task_type,
        }
        if capability:
            body["capability"] = capability
        if sender_session_key:
            body["senderSessionKey"] = sender_session_key
        if parent_task_id:
            body["parentTaskId"] = parent_task_id
        if title:
            body["title"] = title

        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/delegate",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Delegated task: {data}")
        return data

    # ── Task Execution (执行方) ─────────────────────────────

    def poll_tasks(self, limit: int = 10) -> list[dict]:
        """Poll for pending tasks assigned to this bot."""
        resp = requests.get(
            f"{self.api_url}/api/v1/tasks/pending",
            params={"limit": limit},
            headers=self._headers(json=False),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        tasks = data.get("data", {}).get("tasks", [])
        logger.info(f"[{self.name}] Polled: {len(tasks)} tasks")
        return tasks

    def accept_task(self, task_id: str, executor_session_key: str | None = None) -> dict:
        """Accept a pending task."""
        body: dict[str, Any] = {}
        if executor_session_key:
            body["executorSessionKey"] = executor_session_key
        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/accept",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Accepted task {task_id}")
        return data

    def start_task(self, task_id: str) -> dict:
        """Start processing an accepted task."""
        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/start",
            json={},
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Started task {task_id}")
        return data

    def complete_task(
        self,
        task_id: str,
        status: str = "completed",
        result: dict | None = None,
        error: dict | None = None,
        execution_time_ms: int = 0,
    ) -> dict:
        """Complete a task with result or error."""
        body: dict[str, Any] = {"status": status}
        if result is not None:
            body["result"] = result
        if error is not None:
            body["error"] = error
        if execution_time_ms > 0:
            body["executionTimeMs"] = execution_time_ms

        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/complete",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Completed task {task_id} ({status})")
        return data

    # ── Task Query ──────────────────────────────────────────

    def get_task(self, task_id: str) -> dict:
        """Get task details."""
        resp = requests.get(
            f"{self.api_url}/api/v1/tasks/{task_id}",
            headers=self._headers(json=False),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Messaging ────────────────────────────────────────────

    def send_message(
        self,
        to_bot_id: str,
        content: str,
        msg_type: str = "direct_message",
        task_id: str | None = None,
        priority: str = "normal",
        content_type: str = "text",
    ) -> dict:
        """Send a message to another bot's inbox."""
        body: dict[str, Any] = {
            "toBotId": to_bot_id,
            "type": msg_type,
            "content": content,
            "contentType": content_type,
            "priority": priority,
        }
        if task_id:
            body["taskId"] = task_id

        resp = requests.post(
            f"{self.api_url}/api/v1/messages/send",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(
            f"[{self.name}] Sent message to {to_bot_id}"
            f"{f' (taskId={task_id})' if task_id else ''}: {data}"
        )
        return data

    def poll_inbox(self, limit: int = 10) -> list[dict]:
        """Poll this bot's inbox for messages."""
        resp = requests.get(
            f"{self.api_url}/api/v1/messages/inbox",
            params={"limit": limit},
            headers=self._headers(json=False),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        messages = data.get("data", {}).get("messages", [])
        logger.info(f"[{self.name}] Polled inbox: {len(messages)} messages")
        return messages

    def get_message_history(self, limit: int = 20) -> list[dict]:
        """Get message history for this bot."""
        resp = requests.get(
            f"{self.api_url}/api/v1/messages/history",
            params={"limit": limit},
            headers=self._headers(json=False),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        messages = data.get("data", {}).get("messages", [])
        logger.info(f"[{self.name}] Message history: {len(messages)} messages")
        return messages

    # ── Task Monitoring ─────────────────────────────────────

    def wait_for_task(
        self,
        task_id: str,
        timeout_s: float = 120,
        poll_interval_s: float = 2,
        terminal_statuses: tuple[str, ...] = ("completed", "failed", "timeout"),
    ) -> dict:
        """Poll a task until it reaches a terminal status.

        Returns the full task data (including executorSessionKey) once the
        task status is in ``terminal_statuses``, or raises ``TimeoutError``
        if ``timeout_s`` elapses first.
        """
        deadline = time.time() + timeout_s
        last_status = None

        while time.time() < deadline:
            data = self.get_task(task_id)
            task = data.get("data", data)
            # Normalise — API may nest under data.task
            if "task" in task and isinstance(task["task"], dict):
                task = task["task"]

            status = task.get("status", "unknown")
            if status != last_status:
                logger.info(f"[{self.name}] Task {task_id}: {status}")
                last_status = status

            if status in terminal_statuses:
                return task

            time.sleep(poll_interval_s)

        raise TimeoutError(
            f"Task {task_id} did not reach terminal status within {timeout_s}s "
            f"(last status: {last_status})"
        )

    # ── Track Session (API Server persistence) ────────────

    def track_session(
        self,
        task_id: str,
        session_key: str,
        bot_id: str,
        role: str = "executor",
    ) -> dict:
        """POST /api/v1/tasks/:id/track-session — persist session mapping."""
        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/track-session",
            json={
                "sessionKey": session_key,
                "botId": bot_id,
                "role": role,
            },
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Tracked session for task {task_id}: role={role}")
        return data

    def get_task_sessions(self, task_id: str) -> list[dict]:
        """GET /api/v1/tasks/:id/sessions — retrieve persisted session mappings."""
        resp = requests.get(
            f"{self.api_url}/api/v1/tasks/{task_id}/sessions",
            headers=self._headers(json=False),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        sessions = data.get("data", {}).get("sessions", [])
        logger.info(f"[{self.name}] Task {task_id} sessions: {len(sessions)}")
        return sessions

    def resume_task(self, task_id: str, input_text: str | None = None) -> dict:
        """POST /api/v1/tasks/:id/resume — direct API Server resume."""
        body: dict[str, Any] = {}
        if input_text:
            body["input"] = input_text
        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/resume",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Resumed task {task_id}")
        return data

    def wait_for_input(
        self,
        task_id: str,
        reason: str = "",
        target_bot_id: str | None = None,
    ) -> dict:
        """POST /api/v1/tasks/:id/need-human-input — mark task waiting."""
        body: dict[str, Any] = {}
        if reason:
            body["reason"] = reason
        if target_bot_id:
            body["targetBotId"] = target_bot_id
        resp = requests.post(
            f"{self.api_url}/api/v1/tasks/{task_id}/need-human-input",
            json=body,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"[{self.name}] Task {task_id} marked waiting_for_input")
        return data

    # ── High-level: process all pending tasks ───────────────

    def generate_session_key(self) -> str:
        """Generate a unique session key for this bot."""
        key = f"agent:{self.name.lower()}:subagent:{uuid.uuid4()}"
        return key

    def process_pending_tasks(self) -> list[dict]:
        """Poll → accept → start → execute (strategy) → complete for each task."""
        tasks = self.poll_tasks()
        results = []

        for task in tasks:
            task_id = task["id"]
            session_key = self.generate_session_key()
            self.session_keys[task_id] = session_key

            try:
                self.accept_task(task_id, executor_session_key=session_key)
                self.start_task(task_id)

                sr: StrategyResult = self.strategy.execute(task)

                self.complete_task(
                    task_id,
                    status=sr.status,
                    result=sr.result,
                    error=sr.error,
                    execution_time_ms=sr.execution_time_ms,
                )
                results.append({
                    "task_id": task_id,
                    "status": sr.status,
                    "session_key": session_key,
                })
            except Exception as e:
                logger.error(f"[{self.name}] Failed to process task {task_id}: {e}")
                results.append({
                    "task_id": task_id,
                    "status": "error",
                    "error": str(e),
                })

        return results
