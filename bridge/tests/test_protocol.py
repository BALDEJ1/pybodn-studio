"""The bridge's first line, and the bridge as Node runs it: a process on stdin and stdout."""

import json
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path
from typing import Any

import pytest
from pybodn import MemoryEngine

from bridge import PROTOCOL, hello

BRIDGE_DIR = Path(__file__).resolve().parents[1]
SECONDS = 30


# The greeting -----------------------------------------------------------------------------------


def test_the_greeting_names_the_versions_and_the_real_path(db: Path, tmp_path: Path) -> None:
    link = tmp_path / "link.db"
    link.symlink_to(db)

    greeting, bridge = hello({"PYBODN_DB": str(link)})

    assert bridge is not None
    bridge.close()
    assert greeting["ok"] is True
    assert greeting["protocol"] == PROTOCOL
    assert greeting["path"] == str(db.resolve())
    assert greeting["python"] == ".".join(map(str, sys.version_info[:3]))
    assert isinstance(greeting["pybodn"], str)


@pytest.mark.parametrize("value", [None, ""])
def test_without_a_path_the_greeting_asks_for_one(value: str | None) -> None:
    environ = {} if value is None else {"PYBODN_DB": value}

    greeting, bridge = hello(environ)

    assert bridge is None
    assert greeting["error"]["code"] == "missing_env"


@pytest.mark.parametrize("make", ["missing", "empty", "folder"])
def test_the_bridge_never_creates_or_opens_a_file_that_is_not_there(
    tmp_path: Path, make: str
) -> None:
    # Arrange: pybodn itself would create a new empty file at a mistyped path
    path = tmp_path / "memory.db"
    if make == "empty":
        path.touch()
    elif make == "folder":
        path.mkdir()

    # Act
    greeting, bridge = hello({"PYBODN_DB": str(path)})

    # Assert
    assert bridge is None
    assert greeting["error"]["code"] == "no_file"
    assert path.exists() == (make != "missing")
    assert make != "empty" or path.stat().st_size == 0


def test_a_pybodn_without_namespaces_is_too_old(db: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delattr(MemoryEngine, "namespaces")

    greeting, bridge = hello({"PYBODN_DB": str(db)})

    assert bridge is None
    assert greeting["error"]["code"] == "old_pybodn"


def test_a_file_from_a_newer_pybodn_asks_for_an_upgrade(db: Path) -> None:
    with closing(sqlite3.connect(db)) as newer:
        newer.execute("PRAGMA user_version = 99")

    greeting, bridge = hello({"PYBODN_DB": str(db)})

    assert bridge is None
    assert greeting["error"]["code"] == "newer_file"


def test_a_file_that_is_not_pybodn_is_refused_with_the_library_reason(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    path.write_text("not a database at all, just some notes\n" * 100)

    greeting, bridge = hello({"PYBODN_DB": str(path)})

    assert bridge is None
    assert greeting["error"]["code"] == "open_failed"
    assert greeting["error"]["message"]


# The process ------------------------------------------------------------------------------------


def run(db: Path | None, lines: list[str], code: str | None = None) -> tuple[int, list[Any], str]:
    """Run the bridge, send ``lines``, close its input, and return the exit code, the JSON lines
    it wrote to its output and what it wrote to its error stream."""
    env = {key: value for key, value in os.environ.items() if key != "PYBODN_DB"}
    if db is not None:
        env["PYBODN_DB"] = str(db)
    command = (
        [sys.executable, "-I", "bridge.py"] if code is None else [sys.executable, "-I", "-c", code]
    )
    done = subprocess.run(  # noqa: S603 - the command is this Python and this repository's file
        command,
        input="".join(line + "\n" for line in lines),
        capture_output=True,
        text=True,
        cwd=BRIDGE_DIR,
        env=env,
        timeout=SECONDS,
        check=False,
    )
    return done.returncode, [json.loads(line) for line in done.stdout.splitlines()], done.stderr


def test_the_bridge_greets_answers_and_ends_with_its_input(db: Path) -> None:
    requests = [
        json.dumps({"id": 7, "method": "add", "params": {"namespace": "a", "content": "Hi"}}),
        "this line is not JSON",
        json.dumps({"id": "eight", "method": "overview", "params": {}}),
    ]

    code, lines, _ = run(db, requests)

    assert code == 0
    greeting, added, garbled, overview = lines
    assert greeting["hello"]["ok"] is True
    assert (added["id"], added["ok"], added["result"]["content"]) == (7, True, "Hi")
    assert (garbled["id"], garbled["error"]["code"]) == (None, "bad_request")
    assert overview == {
        "id": "eight",
        "ok": True,
        "result": {
            "namespaces": [{"name": "a", "active": 1, "archived": 0, "expired": 0}],
            "expired": 0,
        },
    }


def test_a_stray_print_goes_to_the_error_stream_not_the_protocol(db: Path) -> None:
    # Arrange: a method that prints, as a library or a debug line might
    code = (
        "import sys; sys.path.insert(0, '.'); import bridge\n"
        "plain = bridge.METHODS['overview']\n"
        "def noisy(b, p):\n"
        "    print('noise from somewhere'); return plain(b, p)\n"
        "bridge.METHODS['overview'] = noisy\n"
        "bridge.main()\n"
    )

    # Act
    exit_code, lines, errors = run(
        db, [json.dumps({"id": 1, "method": "overview", "params": {}})], code
    )

    # Assert
    assert exit_code == 0
    assert [line.get("id") for line in lines] == [None, 1]
    assert "noise from somewhere" in errors


def test_a_greeting_that_fails_ends_the_bridge(tmp_path: Path) -> None:
    code, lines, _ = run(tmp_path / "missing.db", [])

    assert code == 1
    assert [line["hello"]["error"]["code"] for line in lines] == ["no_file"]


def test_without_pybodn_the_greeting_says_so(db: Path) -> None:
    code = (
        "import runpy, sys\n"
        "sys.modules['pybodn'] = None\n"
        "runpy.run_path('bridge.py', run_name='__main__')\n"
    )

    exit_code, lines, _ = run(db, [], code)

    assert exit_code == 1
    assert lines[0]["hello"]["error"]["code"] == "no_pybodn"
    assert lines[0]["hello"]["pybodn"] is None
