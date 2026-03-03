"""
Scenario 4: Sub-task (correction use-case)

Verify: sub-task routes to the same sub-agent via targetSessionKey.
"""

import pytest
from simbot import SimBot, FixedStrategy


@pytest.fixture
def delegator(api_url):
    bot = SimBot(
        name="S4-Delegator",
        email="s4-delegator@test.com",
        capabilities=[{"name": "manage_tasks", "description": "Task mgmt", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def executor(api_url):
    bot = SimBot(
        name="S4-Executor",
        email="s4-executor@test.com",
        capabilities=[{"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({"analyze_data": {"sum": 150}}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_correction_as_subtask(delegator: SimBot, executor: SimBot):
    """Complete a task, then send correction (as sub-task) to the same sub-agent."""
    sender_sk = delegator.generate_session_key()
    executor_sk = executor.generate_session_key()

    # ── Phase 1: Original task ──────────────────────────
    r1 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Analyze the dataset [10, 20, 30] and compute sum and average",
        capability="analyze_data",
        parameters={"data": [10, 20, 30]},
        task_type="new",
        sender_session_key=sender_sk,
        title="Analyze dataset [10, 20, 30]",
    )
    task1_id = r1["data"]["taskId"]

    executor.accept_task(task1_id, executor_session_key=executor_sk)
    executor.start_task(task1_id)
    executor.complete_task(task1_id, status="completed", result={"sum": 60, "avg": 20})

    # ── Phase 2: Correction (as sub-task) ────────────────
    r2 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Correct the previous analysis by excluding outliers from the average calculation",
        capability="analyze_data",
        parameters={
            "correction": "avg should exclude outliers",
            "targetSessionKey": executor_sk,
        },
        task_type="sub-task",
        parent_task_id=task1_id,
        sender_session_key=sender_sk,
        title="Correction: exclude outliers from avg",
    )
    task2_id = r2["data"]["taskId"]

    # Executor polls and verifies sub-task fields
    tasks = executor.poll_tasks()
    sub_task = next((t for t in tasks if t["id"] == task2_id), None)
    assert sub_task is not None
    assert sub_task["type"] == "sub-task"
    assert sub_task["parentTaskId"] == task1_id
    assert sub_task["senderSessionKey"] == sender_sk
    assert sub_task["parameters"]["targetSessionKey"] == executor_sk
    assert sub_task["parameters"]["correction"] == "avg should exclude outliers"

    # Executor processes sub-task
    executor.accept_task(task2_id, executor_session_key=executor_sk)
    executor.start_task(task2_id)
    executor.complete_task(
        task2_id,
        status="completed",
        result={"sum": 60, "avg": 15, "note": "outliers excluded"},
    )

    # Verify
    task2 = delegator.get_task(task2_id)
    task2_info = task2.get("data", task2)
    assert task2_info["status"] == "completed"
    assert task2_info["type"] == "sub-task"
    assert task2_info["result"]["note"] == "outliers excluded"
