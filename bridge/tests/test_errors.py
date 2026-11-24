"""Every error the bridge can give, and what it does about it."""

import io
import json
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import closing
from pathlib import Path
from typing import Any

import pytest
from pybodn import MemoryEngine
from pybodn.errors import ConfigurationError, StorageError

from bridge import Bridge, _send
from tests.conftest import call, fail

UPGRADED = StorageError(
    "a newer pybodn has upgraded the file since this process opened it:"
    " restart the process to use it"
)


class Raising:
    """A stand-in engine whose every collection call raises what it is given, while it lasts."""

    def __init__(self, errors: list[BaseException]) -> None:
        self.errors = errors
        self.closed = False

    def collection(self, namespace: str) -> "Raising":
        return self

    def namespaces(self) -> list[str]:
        self._raise()
        return []

    def count(self, **_: object) -> int:
        self._raise()
        return 0

    def close(self) -> None:
        self.closed = True

    def _raise(self) -> None:
        if self.errors:
            raise self.errors.pop(0)


def opener(*engines: Any) -> Callable[[str, float], Any]:
    """Open each of ``engines`` in turn, as ``MemoryEngine.sqlite`` would open the file."""
    queue = list(engines)
    return lambda path, timeout: queue.pop(0)


@pytest.fixture
def locked(db: Path) -> Iterator[None]:
    """Another program holds the file's write lock."""
    holder = sqlite3.connect(db, isolation_level=None)
    holder.execute("BEGIN EXCLUSIVE")
    yield
    holder.execute("ROLLBACK")
    holder.close()


# The library's own errors -----------------------------------------------------------------------


def test_a_missing_record_is_not_found(bridge: Bridge) -> None:
    for method in ("get", "archive", "restore", "delete"):
        assert fail(bridge, method, namespace="user:alice", id="nope")["code"] == "not_found"


def test_a_taken_key_is_a_duplicate(bridge: Bridge, engine: MemoryEngine) -> None:
    engine.collection("user:alice").add("Prefers short answers", key="style")

    error = fail(bridge, "add", namespace="user:alice", content="Other", key="style")

    assert (error["type"], error["code"]) == ("DuplicateKeyError", "duplicate_key")


def test_a_change_made_elsewhere_first_is_a_conflict(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    record = notes.add("Prefers short answers")
    notes.update(record.id, content="Changed by the application")

    error = fail(
        bridge,
        "update",
        namespace="user:alice",
        id=record.id,
        expected_version=1,
        changes={"content": "Changed in Studio"},
    )

    assert (error["type"], error["code"]) == ("ConcurrentUpdateError", "conflict")


def test_a_value_the_library_refuses_keeps_its_reason(bridge: Bridge, engine: MemoryEngine) -> None:
    record = engine.collection("user:alice").add("Prefers short answers")

    error = fail(bridge, "update", namespace="user:alice", id=record.id, changes={"importance": 2})

    assert (error["type"], error["code"]) == ("ValidationError", "invalid")
    assert "importance" in error["message"]


def test_a_busy_file_says_so_and_can_be_tried_again(bridge: Bridge, locked: None) -> None:
    error = fail(bridge, "add", namespace="user:alice", content="Prefers short answers")

    assert (error["type"], error["code"]) == ("StorageError", "busy")


def test_after_an_upgrade_elsewhere_the_bridge_reopens_and_answers(db: Path) -> None:
    # Arrange: the first engine finds the file upgraded; the one opened again works
    stale = Raising([UPGRADED])
    bridge = Bridge(str(db), timeout=0.2, open_engine=opener(stale, MemoryEngine.sqlite(db)))

    # Act
    result = call(bridge, "overview")

    # Assert
    assert result == {"namespaces": [], "expired": 0}
    assert stale.closed
    bridge.close()


def test_a_file_upgraded_past_this_pybodn_needs_a_newer_one(bridge: Bridge, db: Path) -> None:
    # Arrange: a newer pybodn moves the file to a schema this one does not know
    with closing(sqlite3.connect(db)) as newer:
        newer.execute("PRAGMA user_version = 99")

    # Act
    error = fail(bridge, "overview")

    # Assert
    assert error["code"] == "newer_file"


def test_another_storage_error_keeps_its_notes(db: Path) -> None:
    failure = StorageError("the database failed: disk I/O error")
    failure.add_note("deleted data may still be in the file")
    bridge = Bridge(str(db), timeout=0.2, open_engine=opener(Raising([failure])))

    error = fail(bridge, "overview")

    assert error["code"] == "storage"
    assert error["message"] == (
        "the database failed: disk I/O error\ndeleted data may still be in the file"
    )


def test_any_other_pybodn_error_passes_its_message(db: Path) -> None:
    bridge = Bridge(
        str(db), timeout=0.2, open_engine=opener(Raising([ConfigurationError("no model")]))
    )

    error = fail(bridge, "overview")

    assert error == {"type": "ConfigurationError", "code": "pybodn", "message": "no model"}


def test_an_unexpected_error_hides_its_details_and_the_bridge_goes_on(
    db: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    bridge = Bridge(
        str(db),
        timeout=0.2,
        open_engine=opener(Raising([TypeError("text of a record that must stay out")])),
    )

    error = fail(bridge, "overview")
    after = call(bridge, "overview")

    assert error == {"type": "InternalError", "code": "internal", "message": "internal error"}
    assert "text of a record" in capsys.readouterr().err
    assert after == {"namespaces": [], "expired": 0}


# Requests the bridge itself refuses -------------------------------------------------------------


@pytest.mark.parametrize(
    "request_",
    [
        {"id": 1, "method": "drop_everything", "params": {}},
        {"id": 1, "method": "list", "params": {"namespace": "user:alice"}},
        {"id": 1, "method": "list", "params": {"namespace": "user:alice", "view": "deleted"}},
        {"id": 1, "method": "get", "params": {"namespace": 7, "id": "x"}},
        {"id": 1, "method": "update", "params": {"namespace": "a", "id": "x", "changes": []}},
        {
            "id": 1,
            "method": "update",
            "params": {"namespace": "a", "id": "x", "changes": {"key": "new"}},
        },
        {
            "id": 1,
            "method": "update",
            "params": {"namespace": "a", "id": "x", "changes": {"expires_at": "soon"}},
        },
        {
            "id": 1,
            "method": "update",
            "params": {"namespace": "a", "id": "x", "changes": {"expires_at": 5}},
        },
        {"id": 1, "method": "overview", "params": []},
        {"id": 1, "params": {}},
    ],
)
def test_a_request_the_bridge_cannot_read_is_a_bad_request(
    bridge: Bridge, request_: dict[str, object]
) -> None:
    reply = bridge.handle(request_)

    assert reply["ok"] is False
    assert reply["error"]["code"] == "bad_request"
    assert reply["id"] == 1


def test_a_request_that_is_not_an_object_is_answered_without_an_id(bridge: Bridge) -> None:
    reply = bridge.handle(["overview"])

    assert (reply["id"], reply["error"]["code"]) == (None, "bad_request")


def test_an_answer_that_cannot_be_json_becomes_an_error_instead_of_ending_the_bridge() -> None:
    written = io.StringIO()

    _send(written, {"id": 3, "ok": True, "result": float("nan")})

    assert json.loads(written.getvalue()) == {
        "id": 3,
        "ok": False,
        "error": {"type": "InternalError", "code": "internal", "message": "internal error"},
    }
