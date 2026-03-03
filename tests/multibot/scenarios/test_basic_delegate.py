"""
Scenario 1: Basic Delegate-Execute

Delegator bot sends a task, executor bot polls → accept → start → complete.
Verify the full lifecycle and result correctness.
"""

import pytest
from simbot import SimBot, FixedStrategy


@pytest.fixture
def delegator(api_url):
    bot = SimBot(
        name="S1-Delegator",
        email="s1-delegator@test.com",
        capabilities=[{"name": "manage_tasks", "description": "Task mgmt", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def executor(api_url):
    bot = SimBot(
        name="S1-Executor",
        email="s1-executor@test.com",
        capabilities=[{"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({"analyze_data": {"sum": 150, "avg": 30, "min": 10, "max": 50}}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_basic_delegate_execute(delegator: SimBot, executor: SimBot):
    """Full lifecycle: delegate → poll → accept → start → complete → verify result."""
    # Step 1: Delegator sends task with senderSessionKey
    sender_sk = delegator.generate_session_key()
    result = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        capability="analyze_data",
        parameters={"data": [10, 20, 30, 40, 50]},
        task_type="new",
        sender_session_key=sender_sk,
    )
    task_id = result["data"]["taskId"]
    assert task_id

    # Step 2: Executor polls and finds the task
    tasks = executor.poll_tasks()
    task_ids = [t["id"] for t in tasks]
    assert task_id in task_ids

    # Step 3: Verify polled task has senderSessionKey
    polled_task = next(t for t in tasks if t["id"] == task_id)
    assert polled_task["senderSessionKey"] == sender_sk
    assert polled_task["type"] == "new"

    # Step 4: Executor accepts with executorSessionKey
    executor_sk = executor.generate_session_key()
    executor.accept_task(task_id, executor_session_key=executor_sk)

    # Step 5: Executor starts and completes
    executor.start_task(task_id)
    executor.complete_task(
        task_id,
        status="completed",
        result={"sum": 150, "avg": 30, "min": 10, "max": 50},
        execution_time_ms=100,
    )

    # Step 6: Delegator queries result
    task_data = delegator.get_task(task_id)
    task_info = task_data.get("data", task_data)
    assert task_info["status"] == "completed"
    assert task_info["result"]["sum"] == 150
    assert task_info["result"]["avg"] == 30
    assert task_info["senderSessionKey"] == sender_sk
    assert task_info["executorSessionKey"] == executor_sk
