"""
Task processing strategies for SimBot.

Strategies determine how a SimBot handles incoming tasks:
- FixedStrategy: return preset results per capability
- DelayStrategy: add random delay before delegating to inner strategy
- FailStrategy: randomly fail with configurable probability
- CompositeStrategy: combine delay + fail + inner strategy
"""

import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class StrategyResult:
    """Result of a strategy execution."""
    status: str  # "completed" or "failed"
    result: dict[str, Any] | None = None
    error: dict[str, str] | None = None
    execution_time_ms: int = 0


class Strategy(ABC):
    @abstractmethod
    def execute(self, task: dict) -> StrategyResult:
        ...


class FixedStrategy(Strategy):
    """Return preset results per capability name."""

    def __init__(self, responses: dict[str, dict]):
        self.responses = responses

    def execute(self, task: dict) -> StrategyResult:
        capability = task.get("capability", "")
        result = self.responses.get(capability, {"echo": task.get("parameters", {})})
        return StrategyResult(
            status="completed",
            result=result,
            execution_time_ms=10,
        )


class DelayStrategy(Strategy):
    """Wrap another strategy with a random delay."""

    def __init__(self, inner: Strategy, min_ms: int = 500, max_ms: int = 3000):
        self.inner = inner
        self.min_ms = min_ms
        self.max_ms = max_ms

    def execute(self, task: dict) -> StrategyResult:
        delay_ms = random.randint(self.min_ms, self.max_ms)
        time.sleep(delay_ms / 1000.0)
        result = self.inner.execute(task)
        result.execution_time_ms += delay_ms
        return result


class FailStrategy(Strategy):
    """Randomly fail with a given probability, otherwise delegate to inner."""

    def __init__(self, inner: Strategy, fail_rate: float = 0.2):
        self.inner = inner
        self.fail_rate = fail_rate

    def execute(self, task: dict) -> StrategyResult:
        if random.random() < self.fail_rate:
            return StrategyResult(
                status="failed",
                error={
                    "code": "SIMULATED_FAILURE",
                    "message": f"SimBot randomly failed (rate={self.fail_rate})",
                },
                execution_time_ms=5,
            )
        return self.inner.execute(task)


class CompositeStrategy(Strategy):
    """Combine delay + random fail + inner strategy."""

    def __init__(
        self,
        inner: Strategy,
        fail_rate: float = 0.0,
        min_ms: int = 0,
        max_ms: int = 0,
    ):
        chain = inner
        if fail_rate > 0:
            chain = FailStrategy(chain, fail_rate)
        if max_ms > 0:
            chain = DelayStrategy(chain, min_ms, max_ms)
        self.chain = chain

    def execute(self, task: dict) -> StrategyResult:
        return self.chain.execute(task)


def build_strategy(config: dict) -> Strategy:
    """Build a Strategy from a YAML config dict."""
    stype = config.get("type", "fixed")

    if stype == "fixed":
        return FixedStrategy(config.get("responses", {}))

    if stype == "delay":
        inner = build_strategy(config.get("inner", {"type": "fixed", "responses": {}}))
        return DelayStrategy(
            inner,
            min_ms=config.get("min_ms", 500),
            max_ms=config.get("max_ms", 3000),
        )

    if stype == "fail":
        inner = build_strategy(config.get("inner", {"type": "fixed", "responses": {}}))
        return FailStrategy(inner, fail_rate=config.get("fail_rate", 0.2))

    if stype == "composite":
        inner = build_strategy(config.get("inner", {"type": "fixed", "responses": {}}))
        return CompositeStrategy(
            inner,
            fail_rate=config.get("fail_rate", 0.0),
            min_ms=config.get("min_ms", 0),
            max_ms=config.get("max_ms", 0),
        )

    raise ValueError(f"Unknown strategy type: {stype}")
