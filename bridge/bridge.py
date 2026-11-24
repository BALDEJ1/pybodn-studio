"""The bridge between PyBodn Studio and pybodn: one JSON object per line on stdin and stdout.

Node starts it with ``PYBODN_DB`` set to the memory file. Its first line is a greeting with the
versions and the file, or the reason it cannot open the file, and then it ends. After that it
answers one request per line, in order, and ends when its input ends, closing the engine first.

    request  {"id": 1, "method": "list", "params": {"namespace": "user:alice", "view": "active"}}
    answer   {"id": 1, "ok": true, "result": {...}}
             {"id": 1, "ok": false, "error": {"type": "...", "code": "...", "message": "..."}}

Only answers go to stdout. Anything else printed goes to stderr, which stays in the terminal.
"""

from __future__ import annotations

import io
import json
import os
import platform
import sqlite3
import sys
import traceback
from collections import deque
from collections.abc import Callable, Iterator, Mapping
from datetime import UTC, datetime
from typing import Any, TextIO

try:
    import pybodn
    from pybodn import Collection, MemoryEngine, MemoryRecord
    from pybodn.errors import (
        ConcurrentUpdateError,
        DuplicateKeyError,
        PyBodnError,
        RecordNotFoundError,
        StorageError,
        ValidationError,
    )

    HAS_PYBODN = True
except ImportError:  # the greeting says so
    HAS_PYBODN = False

PROTOCOL = 1
# Seconds to wait for another program's lock on the file: far below Node's 30-second limit, so
# a busy file answers "busy" rather than running out of time.
TIMEOUT = 5.0
LIST_LIMIT = 500  # rows a view shows, the newest
CHUNK = 1000  # records read at a time when a view has to look at every record
PREVIEW_LENGTH = 300  # characters of a record's text in a row; get() gives all of it
VIEWS = ("active", "archived", "expired")
CHANGEABLE = frozenset({"content", "tags", "importance", "source", "expires_at", "metadata"})

# Parts of the library's messages that tell its storage errors apart.
_BUSY_CODES = frozenset({sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED})
_BUSY_TEXT = "kept the file busy"
_UPGRADED_TEXT = "has upgraded the file since this process opened it"
_NEWER_TEXT = "upgrade pybodn to open it"

Opener = Callable[[str, float], Any]
Method = Callable[["Bridge", Mapping[str, Any]], Any]


class BadRequest(Exception):
    """A request the bridge cannot read. Node checks every request first, so this is a bug."""


class Bridge:
    """The open engine and the methods Studio calls on it."""

    def __init__(
        self, path: str, *, timeout: float = TIMEOUT, open_engine: Opener | None = None
    ) -> None:
        self.path = path
        self._timeout = timeout
        self._open: Opener = open_engine or _open_sqlite
        self.engine = self._open(path, timeout)

    @classmethod
    def open(cls, path: str, *, timeout: float = TIMEOUT) -> Bridge:
        return cls(path, timeout=timeout)

    def close(self) -> None:
        self.engine.close()

    def handle(self, request: object) -> dict[str, Any]:
        """Answer one request. Never raises: every failure becomes an error answer."""
        request_id = request.get("id") if isinstance(request, dict) else None
        try:
            method, params = _read_request(request)
            result = self._run(method, params)
        except BadRequest as error:
            return _failure(request_id, ("BadRequest", "bad_request", str(error)))
        except Exception as error:  # noqa: BLE001 - every error must become an answer
            return _failure(request_id, describe(error))
        return {"id": request_id, "ok": True, "result": result}

    def _run(self, method: Method, params: Mapping[str, Any]) -> Any:
        try:
            return method(self, params)
        except StorageError as error:
            if _UPGRADED_TEXT not in str(error):
                raise
        # A newer pybodn changed the file. The library checks this before it writes anything,
        # so opening the file again and repeating the call is safe.
        self.engine.close()
        self.engine = self._open(self.path, self._timeout)
        return method(self, params)


def status_of(record: MemoryRecord, now: datetime) -> str:
    """Expired from its expiry on, which wins over archived; else archived; else active."""
    if record.expires_at is not None and record.expires_at <= now:
        return "expired"
    if record.archived_at is not None:
        return "archived"
    return "active"


def describe(error: Exception) -> tuple[str, str, str]:
    """The type, code and message of the answer for ``error``."""
    name = type(error).__name__
    if isinstance(error, ValidationError):
        return name, "invalid", str(error)
    if isinstance(error, RecordNotFoundError):
        return name, "not_found", str(error)
    if isinstance(error, DuplicateKeyError):
        return name, "duplicate_key", str(error)
    if isinstance(error, ConcurrentUpdateError):
        return name, "conflict", str(error)
    if isinstance(error, StorageError):
        return name, _storage_code(error), _with_notes(error)
    if isinstance(error, PyBodnError):
        return name, "pybodn", str(error)
    # The details may hold the text of a record, so they stay in the terminal.
    traceback.print_exception(error, file=sys.stderr)
    return "InternalError", "internal", "internal error"


# The methods ------------------------------------------------------------------------------------


def overview(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    counts = [_counts(bridge.engine.collection(name)) for name in bridge.engine.namespaces()]
    return {"namespaces": counts, "expired": sum(count["expired"] for count in counts)}


def list_view(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    notes = _collection(bridge, params)
    view = _text(params, "view")
    if view not in VIEWS:
        raise BadRequest(f"view must be one of {', '.join(VIEWS)}")
    now = datetime.now(UTC)
    if view == "active":
        total = notes.count()
        page = notes.list(limit=LIST_LIMIT, offset=max(0, total - LIST_LIMIT))
        return {"rows": [_row(record, now) for record in reversed(page)], "total": total}
    newest: deque[MemoryRecord] = deque(maxlen=LIST_LIMIT)
    total = 0
    for record in _every_record(notes):
        if status_of(record, now) == view:
            newest.append(record)
            total += 1
    return {"rows": [_row(record, now) for record in reversed(newest)], "total": total}


def search(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    notes = _collection(bridge, params)
    query = _text(params, "query")
    total = notes.count(include_archived=True, include_expired=True)
    if total == 0:
        return {"views": {view: [] for view in VIEWS}}
    # Every match, hidden ones too, so that each view's count is exact.
    hits = notes.search(
        query, mode="text", limit=total, include_archived=True, include_expired=True
    )
    found = [hit.record for hit in hits]
    owner = notes.get_by_key(query, include_archived=True, include_expired=True)
    if owner is not None:
        found = [owner, *(record for record in found if record.id != owner.id)]
    now = datetime.now(UTC)
    views = {
        view: [_row(record, now) for record in found if status_of(record, now) == view]
        for view in VIEWS
    }
    return {"views": views}


def get(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    record_id = _text(params, "id")
    record = _collection(bridge, params).get(record_id, include_archived=True, include_expired=True)
    if record is None:
        raise RecordNotFoundError(f"there is no memory {record_id!r}")
    return _record(record)


def key_owner(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any] | None:
    """The record that holds the key, hidden or not: a new record with the key replaces it."""
    record = _collection(bridge, params).get_by_key(
        _text(params, "key"), include_archived=True, include_expired=True
    )
    return None if record is None else _record(record)


def add(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    fields = {name: params[name] for name in ("key", "tags") if name in params}
    return _record(_collection(bridge, params).add(_text(params, "content"), **fields))


def put(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    """Replace the record with the key: the text and tags as given, every other field reset."""
    record = _collection(bridge, params).put(
        _text(params, "key"), _text(params, "content"), tags=params.get("tags", ())
    )
    return _record(record)


def update(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    changes = params.get("changes")
    if not isinstance(changes, dict):
        raise BadRequest("changes must be an object")
    unknown = set(changes) - CHANGEABLE
    if unknown:
        raise BadRequest(f"these fields cannot be changed: {', '.join(sorted(unknown))}")
    if "expires_at" in changes:
        changes = {**changes, "expires_at": _moment(changes["expires_at"])}
    record = _collection(bridge, params).update(
        _text(params, "id"), expected_version=params.get("expected_version"), **changes
    )
    return _record(record)


def archive(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    return _record(_collection(bridge, params).archive(_text(params, "id")))


def restore(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    return _record(_collection(bridge, params).restore(_text(params, "id")))


def delete(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, bool]:
    record_id = _text(params, "id")
    if not _collection(bridge, params).delete(record_id):
        raise RecordNotFoundError(f"there is no memory {record_id!r}")
    return {"deleted": True}


def purge_expired(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, int]:
    return {"purged": bridge.engine.purge_expired()}


def erase_deleted(bridge: Bridge, params: Mapping[str, Any]) -> dict[str, Any]:
    bridge.engine.erase_deleted()
    return {}


METHODS: dict[str, Method] = {
    "overview": overview,
    "list": list_view,
    "search": search,
    "get": get,
    "key_owner": key_owner,
    "add": add,
    "put": put,
    "update": update,
    "archive": archive,
    "restore": restore,
    "delete": delete,
    "purge_expired": purge_expired,
    "erase_deleted": erase_deleted,
}


# The greeting and the loop ----------------------------------------------------------------------


def hello(environ: Mapping[str, str]) -> tuple[dict[str, Any], Bridge | None]:
    """The first line: versions and the real path, or why the file cannot be opened."""
    greeting: dict[str, Any] = {
        "protocol": PROTOCOL,
        "python": platform.python_version(),
        "pybodn": None,
        "path": None,
    }
    if not HAS_PYBODN:
        return _refusal(greeting, "no_pybodn", "this Python has no pybodn: install 1.2 or later")
    greeting["pybodn"] = pybodn.__version__
    if not hasattr(MemoryEngine, "namespaces"):
        return _refusal(
            greeting, "old_pybodn", f"pybodn {pybodn.__version__} is too old: install 1.2 or later"
        )
    raw = environ.get("PYBODN_DB", "")
    if not raw:
        return _refusal(greeting, "missing_env", "set PYBODN_DB to the path of your memory file")
    path = os.path.realpath(os.path.expanduser(raw))
    greeting["path"] = path
    # Opening a missing path would make a new empty file, and a typo would look like an empty
    # memory. An empty file is refused for the same reason.
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        return _refusal(greeting, "no_file", f"there is no memory file at {path}")
    try:
        bridge = Bridge(path)
    except StorageError as error:
        code = "newer_file" if _NEWER_TEXT in str(error) else "open_failed"
        return _refusal(greeting, code, _with_notes(error))
    except (PyBodnError, OSError) as error:
        return _refusal(greeting, "open_failed", str(error))
    return {**greeting, "ok": True}, bridge


def main() -> int:
    protocol = _take_stdout()
    greeting, bridge = hello(os.environ)
    _send(protocol, {"hello": greeting})
    if bridge is None:
        return 1
    lines = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    try:
        for line in lines:
            if line.strip():
                _send(protocol, _answer(bridge, line))
    except KeyboardInterrupt:  # Ctrl+C in the terminal reaches this process too
        pass
    finally:
        bridge.close()
    return 0


# Helpers ----------------------------------------------------------------------------------------


def _open_sqlite(path: str, timeout: float) -> MemoryEngine:
    return MemoryEngine.sqlite(path, timeout=timeout)


def _read_request(request: object) -> tuple[Method, Mapping[str, Any]]:
    if not isinstance(request, dict):
        raise BadRequest("a request is a JSON object")
    name = request.get("method")
    method = METHODS.get(name) if isinstance(name, str) else None
    if method is None:
        raise BadRequest(f"there is no method {name!r}")
    params = request.get("params", {})
    if not isinstance(params, dict):
        raise BadRequest("params must be an object")
    return method, params


def _text(params: Mapping[str, Any], name: str) -> str:
    value = params.get(name)
    if not isinstance(value, str):
        raise BadRequest(f"{name} must be a string")
    return value


def _collection(bridge: Bridge, params: Mapping[str, Any]) -> Collection:
    return bridge.engine.collection(_text(params, "namespace"))


def _moment(value: object) -> datetime | None:
    """An ISO 8601 moment; the library refuses one without a time zone."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise BadRequest("expires_at must be an ISO 8601 string or null")
    try:
        return datetime.fromisoformat(value)
    except ValueError as error:
        raise BadRequest(f"expires_at is not an ISO 8601 moment: {value!r}") from error


def _counts(notes: Collection) -> dict[str, Any]:
    visible = notes.count()
    with_archived = notes.count(include_archived=True)
    everything = notes.count(include_archived=True, include_expired=True)
    return {
        "name": notes.namespace,
        "active": visible,
        "archived": with_archived - visible,
        "expired": everything - with_archived,
    }


def _every_record(notes: Collection) -> Iterator[MemoryRecord]:
    offset = 0
    while True:
        chunk = notes.list(limit=CHUNK, offset=offset, include_archived=True, include_expired=True)
        yield from chunk
        if len(chunk) < CHUNK:
            return
        offset += CHUNK


def _record(record: MemoryRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "namespace": record.namespace,
        "content": record.content,
        "key": record.key,
        "metadata": record.metadata,
        "tags": list(record.tags),
        "importance": record.importance,
        "source": record.source,
        "created_at": record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat(),
        "version": record.version,
        "expires_at": _iso(record.expires_at),
        "archived_at": _iso(record.archived_at),
        "status": status_of(record, datetime.now(UTC)),
    }


def _row(record: MemoryRecord, now: datetime) -> dict[str, Any]:
    """What a list shows of a record: the start of its text, never all of a long one."""
    return {
        "id": record.id,
        "content": record.content[:PREVIEW_LENGTH],
        "cut": len(record.content) > PREVIEW_LENGTH,
        "key": record.key,
        "tags": list(record.tags),
        "expires_at": _iso(record.expires_at),
        "updated_at": record.updated_at.isoformat(),
        "version": record.version,
        "status": status_of(record, now),
    }


def _iso(moment: datetime | None) -> str | None:
    return None if moment is None else moment.isoformat()


def _storage_code(error: StorageError) -> str:
    cause = error.__cause__
    if _BUSY_TEXT in str(error) or (
        isinstance(cause, sqlite3.Error) and (cause.sqlite_errorcode & 0xFF) in _BUSY_CODES
    ):
        return "busy"
    if _NEWER_TEXT in str(error):
        return "newer_file"
    return "storage"


def _with_notes(error: BaseException) -> str:
    """The message with the notes the library adds, such as what an erase left in the file."""
    return "\n".join([str(error), *getattr(error, "__notes__", [])])


def _failure(request_id: object, error: tuple[str, str, str]) -> dict[str, Any]:
    kind, code, message = error
    return {
        "id": request_id,
        "ok": False,
        "error": {"type": kind, "code": code, "message": message},
    }


def _refusal(
    greeting: dict[str, Any], code: str, message: str
) -> tuple[dict[str, Any], Bridge | None]:
    return {**greeting, "ok": False, "error": {"code": code, "message": message}}, None


def _answer(bridge: Bridge, line: str) -> dict[str, Any]:
    try:
        request = json.loads(line)
    except json.JSONDecodeError:
        return _failure(None, ("BadRequest", "bad_request", "a request is one line of JSON"))
    return bridge.handle(request)


def _take_stdout() -> TextIO:
    """Keep the real stdout for answers and send everything else printed to stderr."""
    sys.stdout.flush()
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    return protocol


def _send(protocol: TextIO, message: dict[str, Any]) -> None:
    try:
        line = json.dumps(message, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        line = json.dumps(_failure(message.get("id"), describe(error)))
    protocol.write(line + "\n")
    protocol.flush()


if __name__ == "__main__":
    sys.exit(main())
