"""Each method of the bridge on a real file, written by another engine as an application would."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pybodn import MemoryEngine, MemoryRecord, NewMemory

import bridge as bridge_module
from bridge import Bridge, status_of
from tests.conftest import call, fail

PAST = datetime.now(UTC) - timedelta(days=3)
FUTURE = datetime.now(UTC) + timedelta(days=9)


def rows(result: object) -> list[str]:
    """The texts of the rows of a list result, in order."""
    assert isinstance(result, dict)
    return [row["content"] for row in result["rows"]]


def by_view(result: object) -> dict[str, list[str]]:
    assert isinstance(result, dict)
    return {view: [row["content"] for row in found] for view, found in result["views"].items()}


def as_dict(result: object) -> dict[str, Any]:
    assert isinstance(result, dict)
    return result


# The state of a record --------------------------------------------------------------------------


NOW = datetime(2026, 11, 24, 9, 0, tzinfo=UTC)
RECORD = MemoryRecord(
    id="id",
    namespace="user:alice",
    content="Prefers short answers",
    key=None,
    metadata={},
    tags=(),
    importance=0.5,
    source=None,
    created_at=NOW,
    updated_at=NOW,
    version=1,
    expires_at=None,
    archived_at=None,
)


@pytest.mark.parametrize(
    ("expires_at", "archived_at", "state"),
    [
        (None, None, "active"),
        (NOW + timedelta(seconds=1), None, "active"),
        (None, NOW, "archived"),
        (NOW + timedelta(days=1), NOW, "archived"),
        (NOW, None, "expired"),  # expiring this very moment counts as expired
        (NOW - timedelta(days=1), None, "expired"),
        (NOW - timedelta(days=1), NOW, "expired"),  # expired wins over archived
    ],
)
def test_the_state_of_a_record(
    expires_at: datetime | None, archived_at: datetime | None, state: str
) -> None:
    record = replace(RECORD, expires_at=expires_at, archived_at=archived_at)

    assert status_of(record, NOW) == state


# Overview ---------------------------------------------------------------------------------------


def test_the_overview_counts_each_namespace_by_state(bridge: Bridge, engine: MemoryEngine) -> None:
    # Arrange
    alice = engine.collection("user:alice")
    alice.add("Prefers short answers")
    alice.add("Works from home on Fridays")
    alice.archive(alice.add("Planning a trip to Lisbon").id)
    alice.add("Pickup at the south entrance", expires_at=PAST)
    alice.archive(alice.add("Last sprint plan", expires_at=PAST).id)
    engine.collection("user:bob").add("Prefers metric units")

    # Act
    result = as_dict(call(bridge, "overview"))

    # Assert: a record both archived and expired counts as expired
    assert result == {
        "namespaces": [
            {"name": "user:alice", "active": 2, "archived": 1, "expired": 2},
            {"name": "user:bob", "active": 1, "archived": 0, "expired": 0},
        ],
        "expired": 2,
    }


def test_the_overview_of_an_empty_file(bridge: Bridge) -> None:
    assert call(bridge, "overview") == {"namespaces": [], "expired": 0}


# Lists ------------------------------------------------------------------------------------------


def test_the_active_list_is_newest_first(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    for text in ("first", "second", "third"):
        notes.add(text)
    notes.archive(notes.add("archived").id)

    result = call(bridge, "list", namespace="user:alice", view="active")

    assert rows(result) == ["third", "second", "first"]
    assert as_dict(result)["total"] == 3


@pytest.mark.parametrize("view", ["active", "archived", "expired"])
def test_a_list_keeps_the_newest_up_to_the_limit(
    bridge: Bridge, engine: MemoryEngine, monkeypatch: pytest.MonkeyPatch, view: str
) -> None:
    # Arrange: a small limit and small chunks, so that reading crosses chunk edges
    monkeypatch.setattr(bridge_module, "LIST_LIMIT", 3)
    monkeypatch.setattr(bridge_module, "CHUNK", 2)
    notes = engine.collection("user:alice")
    for number in range(1, 6):
        notes.add(f"active {number}")
        notes.archive(notes.add(f"archived {number}").id)
        notes.add(f"expired {number}", expires_at=PAST)

    # Act
    result = as_dict(call(bridge, "list", namespace="user:alice", view=view))

    # Assert
    assert rows(result) == [f"{view} 5", f"{view} 4", f"{view} 3"]
    assert result["total"] == 5


def test_a_row_carries_the_start_of_a_long_text_and_get_carries_all(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    text = "word " * 200
    record = engine.collection("user:alice").add(text)

    row = as_dict(call(bridge, "list", namespace="user:alice", view="active"))["rows"][0]
    full = as_dict(call(bridge, "get", namespace="user:alice", id=record.id))

    assert row["content"] == text[: bridge_module.PREVIEW_LENGTH]
    assert row["cut"] is True
    assert full["content"] == text


def test_a_list_of_a_namespace_without_records_is_empty(bridge: Bridge) -> None:
    assert call(bridge, "list", namespace="user:nobody", view="archived") == {
        "rows": [],
        "total": 0,
    }


# Search -----------------------------------------------------------------------------------------


def test_search_sorts_the_matches_into_the_views(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    notes.add("Prefers short answers")
    notes.archive(notes.add("A short trip to Lisbon").id)
    notes.add("A short meeting at noon", expires_at=PAST)
    notes.add("Has a dog named Miso")

    result = call(bridge, "search", namespace="user:alice", query="short")

    assert by_view(result) == {
        "active": ["Prefers short answers"],
        "archived": ["A short trip to Lisbon"],
        "expired": ["A short meeting at noon"],
    }


def test_search_puts_the_record_whose_key_is_the_query_first(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    notes = engine.collection("user:alice")
    notes.add("Style, style and more style: keep answers short")
    notes.add("Prefers short answers", key="style")
    notes.add("Has a dog named Miso", key="dog-name")

    by_word = by_view(call(bridge, "search", namespace="user:alice", query="style"))
    by_key_only = by_view(call(bridge, "search", namespace="user:alice", query="dog-name"))

    assert by_word["active"][0] == "Prefers short answers"
    assert by_key_only["active"] == ["Has a dog named Miso"]


@pytest.mark.parametrize(("query", "finds"), [("answer", True), ("answ", True), ("ans", False)])
def test_search_finds_a_word_from_its_first_four_letters(
    bridge: Bridge, engine: MemoryEngine, query: str, finds: bool
) -> None:
    # Arrange: what part of a word finds is the library's rule; this pins it down
    engine.collection("user:alice").add("Prefers short answers")

    # Act
    found = by_view(call(bridge, "search", namespace="user:alice", query=query))

    # Assert
    assert found["active"] == (["Prefers short answers"] if finds else [])


def test_search_returns_every_match_without_a_cap(
    bridge: Bridge, engine: MemoryEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(bridge_module, "LIST_LIMIT", 2)
    engine.collection("user:alice").add_many([NewMemory(f"note {n}") for n in range(15)])

    result = by_view(call(bridge, "search", namespace="user:alice", query="note"))

    assert len(result["active"]) == 15


def test_search_in_an_empty_namespace_finds_nothing(bridge: Bridge) -> None:
    assert by_view(call(bridge, "search", namespace="user:nobody", query="short")) == {
        "active": [],
        "archived": [],
        "expired": [],
    }


def test_a_query_of_too_many_words_is_refused_with_the_library_reason(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    engine.collection("user:alice").add("Prefers short answers")
    query = " ".join(f"word{n}" for n in range(101))

    error = fail(bridge, "search", namespace="user:alice", query=query)

    assert error["code"] == "invalid"
    assert "100" in error["message"]


# Reading one record -----------------------------------------------------------------------------


def test_get_finds_hidden_records(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    archived = notes.add("Planning a trip to Lisbon")
    notes.archive(archived.id)
    expired = notes.add("Pickup at the south entrance", expires_at=PAST)

    assert as_dict(call(bridge, "get", namespace="user:alice", id=archived.id))["status"] == (
        "archived"
    )
    assert as_dict(call(bridge, "get", namespace="user:alice", id=expired.id))["status"] == (
        "expired"
    )


def test_a_record_comes_back_with_every_field(bridge: Bridge, engine: MemoryEngine) -> None:
    record = engine.collection("user:alice").add(
        "Lives in Osaka",
        key="timezone",
        tags=["location"],
        importance=0.6,
        source="chat",
        metadata={"utc_offset": 9},
        expires_at=FUTURE,
    )

    result = as_dict(call(bridge, "get", namespace="user:alice", id=record.id))

    assert result == {
        "id": record.id,
        "namespace": "user:alice",
        "content": "Lives in Osaka",
        "key": "timezone",
        "metadata": {"utc_offset": 9},
        "tags": ["location"],
        "importance": 0.6,
        "source": "chat",
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
        "version": 1,
        "expires_at": record.expires_at.isoformat() if record.expires_at else None,
        "archived_at": None,
        "status": "active",
    }


@pytest.mark.parametrize("hide", ["archive", "expire"])
def test_the_owner_of_a_key_is_found_even_when_hidden(
    bridge: Bridge, engine: MemoryEngine, hide: str
) -> None:
    notes = engine.collection("user:alice")
    record = notes.add("Prefers short answers", key="style", expires_at=None)
    if hide == "archive":
        notes.archive(record.id)
    else:
        notes.update(record.id, expires_at=PAST)

    owner = as_dict(call(bridge, "key_owner", namespace="user:alice", key="style"))

    assert owner["id"] == record.id


def test_a_free_key_has_no_owner(bridge: Bridge) -> None:
    assert call(bridge, "key_owner", namespace="user:alice", key="style") is None


# Writes -----------------------------------------------------------------------------------------


def test_add_creates_the_namespace_with_its_first_record(bridge: Bridge) -> None:
    created = as_dict(
        call(bridge, "add", namespace="user:carol", content="Likes tea", tags=["food"], key="drink")
    )

    assert (created["namespace"], created["key"], created["tags"]) == (
        "user:carol",
        "drink",
        ["food"],
    )
    assert as_dict(call(bridge, "overview"))["namespaces"] == [
        {"name": "user:carol", "active": 1, "archived": 0, "expired": 0}
    ]


def test_put_replaces_the_text_and_tags_and_resets_every_other_field(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    # Arrange: the owner of the key is archived and has every field set
    notes = engine.collection("user:alice")
    old = notes.add(
        "Old text",
        key="style",
        tags=["old"],
        importance=0.9,
        source="chat",
        metadata={"confirmed": True},
        expires_at=FUTURE,
    )
    notes.archive(old.id)

    # Act
    new = as_dict(
        call(bridge, "put", namespace="user:alice", key="style", content="New text", tags=["new"])
    )

    # Assert
    defaults = NewMemory("x")
    assert new["id"] == old.id
    assert {field: new[field] for field in ("content", "tags", "importance", "source")} == {
        "content": "New text",
        "tags": ["new"],
        "importance": defaults.importance,
        "source": defaults.source,
    }
    assert (new["metadata"], new["expires_at"], new["archived_at"]) == ({}, None, None)
    assert new["status"] == "active"


def test_update_changes_only_the_fields_sent(bridge: Bridge, engine: MemoryEngine) -> None:
    record = engine.collection("user:alice").add("Old text", tags=["style"], source="chat")

    changed = as_dict(
        call(
            bridge,
            "update",
            namespace="user:alice",
            id=record.id,
            expected_version=1,
            changes={"content": "New text", "importance": 0.8, "source": None},
        )
    )

    assert (changed["content"], changed["importance"], changed["source"]) == ("New text", 0.8, None)
    assert (changed["tags"], changed["version"]) == (["style"], 2)


def test_an_expiry_keeps_its_moment_and_is_stored_in_utc(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    record = engine.collection("user:alice").add("On vacation")

    changed = as_dict(
        call(
            bridge,
            "update",
            namespace="user:alice",
            id=record.id,
            changes={"expires_at": "2030-12-03T00:00:00+02:00"},
        )
    )
    cleared = as_dict(
        call(bridge, "update", namespace="user:alice", id=record.id, changes={"expires_at": None})
    )

    assert changed["expires_at"] == "2030-12-02T22:00:00+00:00"
    assert cleared["expires_at"] is None


def test_an_expiry_without_a_time_zone_is_refused_by_the_library(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    record = engine.collection("user:alice").add("On vacation")

    error = fail(
        bridge,
        "update",
        namespace="user:alice",
        id=record.id,
        changes={"expires_at": "2030-12-03T00:00:00"},
    )

    assert error["code"] == "invalid"


def test_archive_and_restore_return_the_new_state(bridge: Bridge, engine: MemoryEngine) -> None:
    record = engine.collection("user:alice").add("Planning a trip to Lisbon")

    archived = as_dict(call(bridge, "archive", namespace="user:alice", id=record.id))
    restored = as_dict(call(bridge, "restore", namespace="user:alice", id=record.id))

    assert (archived["status"], archived["version"]) == ("archived", 2)
    assert (restored["status"], restored["version"]) == ("active", 3)


def test_delete_removes_the_record_and_its_namespace_with_it(
    bridge: Bridge, engine: MemoryEngine
) -> None:
    record = engine.collection("user:alice").add("Prefers short answers")

    result = call(bridge, "delete", namespace="user:alice", id=record.id)

    assert result == {"deleted": True}
    assert engine.namespaces() == []


def test_purge_expired_says_how_many_went(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    notes.add("Pickup at the south entrance", expires_at=PAST)
    notes.add("Prefers short answers")

    assert call(bridge, "purge_expired") == {"purged": 1}
    assert notes.count(include_expired=True) == 1


def test_erase_deleted_leaves_the_records_kept(bridge: Bridge, engine: MemoryEngine) -> None:
    notes = engine.collection("user:alice")
    notes.delete(notes.add("Gone").id)
    notes.add("Kept")

    assert call(bridge, "erase_deleted") == {}
    assert [record.content for record in notes.list()] == ["Kept"]
