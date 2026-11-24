"""Make a demo memory file with the sample memories of the Studio mockup.

    uv run --project bridge python -I bridge/seed.py demo.db

Expiry dates count from today, so the demo never goes stale: one memory has already expired
and two expire in the coming days. An existing file is never touched.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pybodn import MemoryEngine

# Each namespace with its memories, as (text, fields). "archived" is not a field of the library:
# such a memory is archived after it is added. "expires_in_days" counts from today.
SAMPLES: dict[str, list[tuple[str, dict[str, Any]]]] = {
    "user:alice": [
        (
            "Prefers short answers without bullet points",
            {
                "key": "answer-style",
                "tags": ["style"],
                "importance": 0.8,
                "source": "chat",
                "metadata": {"channel": "web", "confirmed": True},
            },
        ),
        ("Works from home on Fridays", {"tags": ["schedule"], "source": "chat"}),
        (
            "Allergic to peanuts",
            {
                "key": "allergy",
                "tags": ["health", "food"],
                "importance": 0.9,
                "source": "onboarding form",
                "metadata": {"severity": "high"},
            },
        ),
        (
            "Lives in Osaka, timezone is UTC+9",
            {
                "key": "timezone",
                "tags": ["location"],
                "importance": 0.6,
                "source": "chat",
                "metadata": {"utc_offset": 9},
            },
        ),
        (
            "On vacation for the next nine days",
            {
                "key": "availability",
                "tags": ["schedule"],
                "importance": 0.7,
                "source": "email",
                "metadata": {"auto_reply": True},
                "expires_in_days": 9,
            },
        ),
        (
            "Uses PostgreSQL at work and SQLite for side projects",
            {"tags": ["tech"], "importance": 0.4, "source": "chat"},
        ),
        (
            "Learning Spanish, around level B1",
            {"tags": ["learning"], "source": "chat", "metadata": {"started": "2026-06"}},
        ),
        ("Has a dog named Miso", {"tags": ["personal"], "importance": 0.3, "source": "chat"}),
        (
            "Planning a trip to Lisbon in October",
            {"tags": ["travel"], "importance": 0.4, "source": "chat", "archived": True},
        ),
    ],
    "user:bob": [
        (
            "Prefers metric units",
            {"key": "units", "tags": ["style"], "importance": 0.6, "source": "chat"},
        ),
        (
            "Runs a small bakery in Lyon",
            {
                "tags": ["work"],
                "importance": 0.7,
                "source": "onboarding form",
                "metadata": {"employees": 4},
            },
        ),
        (
            "Asked not to get emails on weekends",
            {
                "key": "email-days",
                "tags": ["contact"],
                "importance": 0.9,
                "source": "support ticket",
                "metadata": {"ticket": 4182},
            },
        ),
    ],
    "agent:planner": [
        (
            "Deploys go out on Tuesdays",
            {"key": "deploy-day", "tags": ["process"], "importance": 0.8, "source": "agent"},
        ),
        (
            "The staging database is reset every night",
            {
                "tags": ["infra"],
                "importance": 0.6,
                "source": "agent",
                "metadata": {"at": "02:00 UTC"},
            },
        ),
        (
            "Last sprint plan was split into five tasks",
            {"tags": ["plans"], "importance": 0.3, "source": "agent", "expires_in_days": 8},
        ),
        (
            "Pickup for the team offsite is at the south entrance",
            {"tags": ["events"], "source": "agent", "expires_in_days": -3},
        ),
    ],
    "support-bot": [
        (
            "Refunds over 200 EUR need a human",
            {
                "key": "refund-limit",
                "tags": ["policy"],
                "importance": 1.0,
                "source": "admin",
                "metadata": {"currency": "EUR", "limit": 200},
            },
        ),
        (
            "Most tickets arrive between 9 and 11 in the morning",
            {"tags": ["stats"], "importance": 0.4, "source": "agent"},
        ),
    ],
}


def seed(path: Path, today: datetime) -> None:
    """Write the samples to a new file at ``path``. ``today`` is any moment of the current day."""
    if path.exists():
        raise FileExistsError(f"{path} already exists: remove it first, or name another file")
    midnight = today.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    with MemoryEngine.sqlite(path) as engine:
        for namespace, samples in SAMPLES.items():
            notes = engine.collection(namespace)
            for text, sample in samples:
                fields = {
                    k: v for k, v in sample.items() if k not in ("archived", "expires_in_days")
                }
                if "expires_in_days" in sample:
                    fields["expires_at"] = midnight + timedelta(days=sample["expires_in_days"])
                record = notes.add(text, **fields)
                if sample.get("archived"):
                    notes.archive(record.id)


def main(arguments: list[str]) -> int:
    path = Path(arguments[0] if arguments else "demo.db")
    try:
        seed(path, datetime.now(UTC))
    except FileExistsError as error:
        print(error, file=sys.stderr)
        return 1
    print(f"Made {path.resolve()}. Start Studio with: PYBODN_DB={path} npm run dev")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
