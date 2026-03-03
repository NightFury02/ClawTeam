"""
BotPool - Manage multiple SimBots from a YAML config.
"""

import logging
from pathlib import Path
from typing import Any

import yaml

from .bot import SimBot
from .strategy import Strategy, build_strategy

logger = logging.getLogger("simbot")


class BotPool:
    """Create, register, and manage multiple SimBots from config."""

    def __init__(self, config: dict | None = None, config_path: str | None = None):
        if config is not None:
            self._config = config
        elif config_path:
            self._config = yaml.safe_load(Path(config_path).read_text())
        else:
            raise ValueError("Either config or config_path is required")

        self.api_url: str = self._config.get("api_url", "http://localhost:3000")
        self.invite_code: str = self._config.get("invite_code", "TEST2024")
        self.bots: list[SimBot] = []

    def setup(self) -> None:
        """Create and register all bots from config."""
        for bot_cfg in self._config.get("bots", []):
            strategy = build_strategy(bot_cfg.get("strategy", {"type": "fixed"}))
            bot = SimBot(
                name=bot_cfg["name"],
                email=bot_cfg.get("email", f"{bot_cfg['name'].lower()}@test.com"),
                capabilities=bot_cfg.get("capabilities", []),
                strategy=strategy,
                api_url=self.api_url,
                invite_code=self.invite_code,
            )
            bot.register()
            self.bots.append(bot)
            logger.info(f"BotPool: registered {bot.name} (id={bot.bot_id})")

    def get_by_name(self, name: str) -> SimBot | None:
        for bot in self.bots:
            if bot.name == name:
                return bot
        return None

    def get_by_capability(self, capability: str) -> SimBot | None:
        for bot in self.bots:
            for cap in bot.capabilities:
                if cap.get("name") == capability:
                    return bot
        return None

    def process_all_pending(self) -> dict[str, list]:
        """All bots poll and process their pending tasks."""
        results: dict[str, list] = {}
        for bot in self.bots:
            results[bot.name] = bot.process_pending_tasks()
        return results

    def teardown(self) -> None:
        """Cleanup (future: deregister bots)."""
        self.bots.clear()
