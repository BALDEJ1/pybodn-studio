from datetime import UTC, datetime
from pathlib import Path

import pytest
from pybodn import MemoryEngine

from seed import main, seed


def test_the_demo_has_every_state_with_expiries_counted_from_today(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "demo.db"
    today = datetime.now(UTC)

    # Act
    seed(path, today)

    # Assert
    with MemoryEngine.sqlite(path) as engine:
        assert engine.namespaces() == ["agent:planner", "support-bot", "user:alice", "user:bob"]
        alice = engine.collection("user:alice")
        planner = engine.collection("agent:planner")
        assert (alice.count(), alice.count(include_archived=True)) == (8, 9)
        assert (planner.count(), planner.count(include_expired=True)) == (3, 4)
        vacation = alice.get_by_key("availability")
        assert vacation is not None and vacation.expires_at is not None
        assert (vacation.expires_at.date() - today.date()).days == 9


def test_the_demo_never_overwrites_a_file(tmp_path: Path) -> None:
    path = tmp_path / "memory.db"
    path.write_bytes(b"someone's memories")

    with pytest.raises(FileExistsError):
        seed(path, datetime.now(UTC))
    assert main([str(path)]) == 1
    assert path.read_bytes() == b"someone's memories"
