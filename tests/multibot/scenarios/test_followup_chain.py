"""
Scenario 3: Sub-task Chain

Verify: new → sub-task with sessionKey routing.
The delegator gets executorSessionKey from the first task,
then uses it as targetSessionKey in the sub-task.
"""

import pytest
from simbot import SimBot, FixedStrategy


@pytest.fixture
def delegator(api_url):
    bot = SimBot(
        name="S3-Delegator",
        email="s3-delegator@test.com",
        capabilities=[{"name": "manage_tasks", "description": "Task mgmt", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def executor(api_url):
    bot = SimBot(
        name="S3-Executor",
        email="s3-executor@test.com",
        capabilities=[{"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({"analyze_data": {"sum": 150, "avg": 30}}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_sub_task_chain(delegator: SimBot, executor: SimBot):
    """new task → get executorSessionKey → sub-task with targetSessionKey."""
    sender_sk = delegator.generate_session_key()
    executor_sk = executor.generate_session_key()

    # ── Phase 1: New task ───────────────────────────────
    r1 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Analyze the initial dataset [10, 20, 30] and return sum and average",
        capability="analyze_data",
        parameters={"data": [10, 20, 30]},
        task_type="new",
        sender_session_key=sender_sk,
        title="Analyze initial dataset",
    )
    task1_id = r1["data"]["taskId"]

    # Executor processes
    executor.accept_task(task1_id, executor_session_key=executor_sk)
    executor.start_task(task1_id)
    executor.complete_task(task1_id, status="completed", result={"sum": 60, "avg": 20})

    # Delegator gets result and executorSessionKey
    task1 = delegator.get_task(task1_id)
    task1_info = task1.get("data", task1)
    assert task1_info["status"] == "completed"
    assert task1_info["executorSessionKey"] == executor_sk

    # ── Phase 2: Sub-task ──────────────────────────
    r2 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Merge additional data [40, 50] into the previous analysis results",
        capability="analyze_data",
        parameters={
            "data": [40, 50],
            "operation": "merge",
            "targetSessionKey": executor_sk,
        },
        task_type="sub-task",
        parent_task_id=task1_id,
        sender_session_key=sender_sk,
        title="Merge additional data into results",
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

    # Executor completes sub-task with same session key
    executor.accept_task(task2_id, executor_session_key=executor_sk)
    executor.start_task(task2_id)
    executor.complete_task(
        task2_id,
        status="completed",
        result={"merged_sum": 150, "merged_avg": 30},
    )

    # Delegator verifies sub-task result
    task2 = delegator.get_task(task2_id)
    task2_info = task2.get("data", task2)
    assert task2_info["status"] == "completed"
    assert task2_info["type"] == "sub-task"
    assert task2_info["parentTaskId"] == task1_id
    assert task2_info["senderSessionKey"] == sender_sk
    assert task2_info["executorSessionKey"] == executor_sk
    assert task2_info["result"]["merged_sum"] == 150
