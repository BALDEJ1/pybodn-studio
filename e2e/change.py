"""Change a namespace from a process of its own, as another program that uses the file would.

    uv run --project bridge python -I e2e/change.py FILE NAMESPACE update '{"id": "…", "tags": []}'
    uv run --project bridge python -I e2e/change.py FILE NAMESPACE add '{"content": "…"}'

The fields are given by name to the collection's ``add`` or ``update``. No version is passed to
``update``: the change wins.
"""

from __future__ import annotations

import json
import sys

from pybodn import MemoryEngine

METHODS = frozenset({"add", "update"})


def main(argv: list[str]) -> int:
    path, namespace, method, fields = argv
    if method not in METHODS:
        raise SystemExit(f"method must be one of {sorted(METHODS)}, not {method!r}")
    with MemoryEngine.sqlite(path) as engine:
        getattr(engine.collection(namespace), method)(**json.loads(fields))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
