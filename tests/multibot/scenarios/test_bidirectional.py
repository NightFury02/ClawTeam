"""
Scenario 5: Bidirectional

Both bots can delegate to each other.
Bot A delegates to Bot B, then Bot B delegates back to Bot A.
"""

import pytest
from simbot import SimBot, FixedStrategy


@pytest.fixture
def bot_a(api_url):
    bot = SimBot(
        name="S5-BotA",
        email="s5-bota@test.com",
        capabilities=[
            {"name": "generate_report", "description": "Generate reports", "parameters": {}, "async": False, "estimatedTime": "5s"},
        ],
        strategy=FixedStrategy({"generate_report": {"format": "pdf", "url": "/report.pdf"}}),
        api_url=api_url,
    )
    bot.register()
    return bot


@pytest.fixture
def bot_b(api_url):
    bot = SimBot(
        name="S5-BotB",
        email="s5-botb@test.com",
        capabilities=[
            {"name": "analyze_data", "description": "Data analysis", "parameters": {}, "async": False, "estimatedTime": "5s"},
        ],
        strategy=FixedStrategy({"analyze_data": {"sum": 100, "avg": 25}}),
        api_url=api_url,
    )
    bot.register()
    return bot


def test_bidirectional_delegation(bot_a: SimBot, bot_b: SimBot):
    """A delegates to B, then B delegates to A."""
    # ── A → B: analyze_data ─────────────────────────────
    r1 = bot_a.delegate_task(
        to_bot_id=bot_b.bot_id,
        capability="analyze_data",
        parameters={"data": [10, 20, 30, 40]},
        task_type="new",
        sender_session_key=bot_a.generate_session_key(),
    )
    task1_id = r1["data"]["taskId"]

    # B processes
    results_b = bot_b.process_pending_tasks()
    assert any(r["task_id"] == task1_id and r["status"] == "completed" for r in results_b)

    t1 = bot_a.get_task(task1_id)
    assert t1.get("data", t1)["status"] == "completed"

    # ── B → A: generate_report ──────────────────────────
    r2 = bot_b.delegate_task(
        to_bot_id=bot_a.bot_id,
        capability="generate_report",
        parameters={"source_task": task1_id},
        task_type="new",
        sender_session_key=bot_b.generate_session_key(),
    )
    task2_id = r2["data"]["taskId"]

    # A processes
    results_a = bot_a.process_pending_tasks()
    assert any(r["task_id"] == task2_id and r["status"] == "completed" for r in results_a)

    t2 = bot_b.get_task(task2_id)
    t2_info = t2.get("data", t2)
    assert t2_info["status"] == "completed"
    assert t2_info["result"]["format"] == "pdf"
