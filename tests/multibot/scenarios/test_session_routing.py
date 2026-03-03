"""
Scenario 6: Session Routing (Full Chain)

Verify the complete sessionKey bidirectional routing:
  new → get executorSessionKey
  sub-task → targetSessionKey routing

All using the same sender/executor session keys throughout.
"""

import pytest
from simbot import SimBot, FixedStrategy


@pytest.fixture
def delegator(api_url):
    bot = SimBot(
        name="S6-Delegator",
        email="s6-delegator@test.com",
        capabilities=[{"name": "manage_tasks", "description": "Task mgmt", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def executor(api_url):
    bot = SimBot(
        name="S6-Executor",
        email="s6-executor@test.com",
        capabilities=[{"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({"analyze_data": {"sum": 150}}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_full_session_routing(delegator: SimBot, executor: SimBot):
    """new → sub-task → sub-task, all with sessionKey routing."""
    sender_sk = delegator.generate_session_key()
    executor_sk = executor.generate_session_key()

    # ── Step 1: New task ────────────────────────────────
    r1 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Analyze the full dataset [10, 20, 30, 40, 50] and compute sum and average",
        capability="analyze_data",
        parameters={"data": [10, 20, 30, 40, 50]},
        task_type="new",
        sender_session_key=sender_sk,
        title="Analyze dataset [10..50]",
    )
    task1_id = r1["data"]["taskId"]

    # Step 2: Verify senderSessionKey stored
    t1_pre = delegator.get_task(task1_id)
    t1_pre_info = t1_pre.get("data", t1_pre)
    assert t1_pre_info["senderSessionKey"] == sender_sk
    assert t1_pre_info.get("executorSessionKey") is None

    # Step 3: Executor accepts with executorSessionKey
    executor.accept_task(task1_id, executor_session_key=executor_sk)

    # Step 4: Verify both keys present
    t1_accepted = delegator.get_task(task1_id)
    t1_accepted_info = t1_accepted.get("data", t1_accepted)
    assert t1_accepted_info["senderSessionKey"] == sender_sk
    assert t1_accepted_info["executorSessionKey"] == executor_sk

    # Step 5: Complete
    executor.start_task(task1_id)
    executor.complete_task(
        task1_id,
        status="completed",
        result={"sum": 150, "avg": 30},
        execution_time_ms=200,
    )

    # Step 6: Verify keys persist after completion
    t1_done = delegator.get_task(task1_id)
    t1_done_info = t1_done.get("data", t1_done)
    assert t1_done_info["status"] == "completed"
    assert t1_done_info["executorSessionKey"] == executor_sk

    # ── Step 7: Sub-task (followup use-case) ─────────────
    r2 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Merge additional data [60, 70, 80] into the existing analysis results",
        capability="analyze_data",
        parameters={
            "data": [60, 70, 80],
            "operation": "merge",
            "targetSessionKey": executor_sk,
        },
        task_type="sub-task",
        parent_task_id=task1_id,
        sender_session_key=sender_sk,
        title="Merge additional data [60..80]",
    )
    task2_id = r2["data"]["taskId"]

    # Step 8: Executor polls - verify routing info
    tasks = executor.poll_tasks()
    sub_task1 = next((t for t in tasks if t["id"] == task2_id), None)
    assert sub_task1 is not None
    assert sub_task1["type"] == "sub-task"
    assert sub_task1["parentTaskId"] == task1_id
    assert sub_task1["senderSessionKey"] == sender_sk
    assert sub_task1["parameters"]["targetSessionKey"] == executor_sk

    # Step 9: Complete sub-task with same executor_sk
    executor.accept_task(task2_id, executor_session_key=executor_sk)
    executor.start_task(task2_id)
    executor.complete_task(task2_id, status="completed", result={"merged_sum": 360})

    # ── Step 10: Sub-task (correction use-case) ──────────
    r3 = delegator.delegate_task(
        to_bot_id=executor.bot_id,
        prompt="Correct the merged analysis by excluding value 80 from the dataset",
        capability="analyze_data",
        parameters={
            "correction": "exclude value 80",
            "targetSessionKey": executor_sk,
        },
        task_type="sub-task",
        parent_task_id=task1_id,
        sender_session_key=sender_sk,
        title="Correction: exclude value 80",
    )
    task3_id = r3["data"]["taskId"]

    # Step 11: Executor polls - verify sub-task routing
    tasks = executor.poll_tasks()
    sub_task2 = next((t for t in tasks if t["id"] == task3_id), None)
    assert sub_task2 is not None
    assert sub_task2["type"] == "sub-task"
    assert sub_task2["parentTaskId"] == task1_id
    assert sub_task2["parameters"]["targetSessionKey"] == executor_sk

    # Step 12: Complete sub-task
    executor.accept_task(task3_id, executor_session_key=executor_sk)
    executor.start_task(task3_id)
    executor.complete_task(
        task3_id,
        status="completed",
        result={"corrected_sum": 280, "note": "excluded 80"},
    )

    # ── Final verification ──────────────────────────────
    # All 3 tasks share the same sender/executor session keys
    for tid in [task1_id, task2_id, task3_id]:
        t = delegator.get_task(tid)
        info = t.get("data", t)
        assert info["senderSessionKey"] == sender_sk, f"Task {tid} senderSessionKey mismatch"
        assert info["executorSessionKey"] == executor_sk, f"Task {tid} executorSessionKey mismatch"
        assert info["status"] == "completed", f"Task {tid} not completed"
