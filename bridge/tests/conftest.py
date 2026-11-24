from collections.abc import Iterator
from pathlib import Path

import pytest
from pybodn import MemoryEngine

from bridge import Bridge


@pytest.fixture
def db(tmp_path: Path) -> Path:
    """A pybodn file with no records."""
    path = tmp_path / "memory.db"
    MemoryEngine.sqlite(path).close()
    return path


@pytest.fixture
def engine(db: Path) -> Iterator[MemoryEngine]:
    """Another engine on the same file: the application that writes while Studio is open."""
    with MemoryEngine.sqlite(db) as other:
        yield other


@pytest.fixture
def bridge(db: Path) -> Iterator[Bridge]:
    opened = Bridge.open(str(db), timeout=0.2)
    yield opened
    opened.close()


def call(bridge: Bridge, method: str, **params: object) -> object:
    """Send one request the way Node does and return its result, failing on an error."""
    reply = bridge.handle({"id": 1, "method": method, "params": params})
    assert reply["ok"], reply
    return reply["result"]


def fail(bridge: Bridge, method: str, **params: object) -> dict[str, str]:
    """Send one request that must fail and return its error."""
    reply = bridge.handle({"id": 1, "method": method, "params": params})
    assert not reply["ok"], reply
    error: dict[str, str] = reply["error"]
    return error
