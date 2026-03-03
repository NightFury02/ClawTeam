"""
Scenario 2: Multi Executor

Multiple bots register the same capability.
Tasks are assigned to specific bots via toBotId.
Each bot only sees tasks assigned to it.
"""

import pytest
from simbot import SimBot, FixedStrategy


def make_executor(api_url, name, suffix):
    bot = SimBot(
        name=f"S2-{name}-{suffix}",
        email=f"s2-{name.lower()}-{suffix}@test.com",
        capabilities=[{"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({"analyze_data": {"result": f"from-{name}"}}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def delegator(api_url):
    bot = SimBot(
        name="S2-Delegator",
        email="s2-delegator@test.com",
        capabilities=[{"name": "manage_tasks", "description": "Task mgmt", "parameters": {}, "async": False, "estimatedTime": "5s"}],
        strategy=FixedStrategy({}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_multi_executor_isolation(delegator: SimBot, api_url):
    """Each bot only sees tasks assigned to it."""
    import time
    suffix = str(int(time.time()))

    exec_a = make_executor(api_url, "Alpha", suffix)
    exec_b = make_executor(api_url, "Beta", suffix)

    # Delegate one task to each
    r1 = delegator.delegate_task(exec_a.bot_id, "analyze_data", {"batch": 1})
    r2 = delegator.delegate_task(exec_b.bot_id, "analyze_data", {"batch": 2})
    task_a_id = r1["data"]["taskId"]
    task_b_id = r2["data"]["taskId"]

    # Each bot polls - should only see their own task
    tasks_a = exec_a.poll_tasks()
    tasks_b = exec_b.poll_tasks()

    ids_a = [t["id"] for t in tasks_a]
    ids_b = [t["id"] for t in tasks_b]

    assert task_a_id in ids_a
    assert task_b_id not in ids_a
    assert task_b_id in ids_b
    assert task_a_id not in ids_b

    # Both process their tasks
    exec_a.process_pending_tasks()
    exec_b.process_pending_tasks()

    # Verify both completed
    t1 = delegator.get_task(task_a_id)
    t2 = delegator.get_task(task_b_id)
    assert t1.get("data", t1)["status"] == "completed"
    assert t2.get("data", t2)["status"] == "completed"
