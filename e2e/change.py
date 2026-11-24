"""Change a memory from a process of its own, as another program that uses the file would.

    uv run --project bridge python -I e2e/change.py FILE NAMESPACE ID '{"tags": ["travel"]}'

The changes are the fields to give ``update``, as JSON. No version is passed: the change wins.
"""

from __future__ import annotations

import json
import sys

from pybodn import MemoryEngine


def main(argv: list[str]) -> int:
    path, namespace, memory_id, changes = argv
    with MemoryEngine.sqlite(path) as engine:
        engine.collection(namespace).update(memory_id, **json.loads(changes))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
