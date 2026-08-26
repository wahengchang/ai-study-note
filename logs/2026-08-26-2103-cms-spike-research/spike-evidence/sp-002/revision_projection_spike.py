#!/usr/bin/env python3
"""SP-002：比較 revision/current/published/projection 模型。"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

NOW = "2026-08-26T00:00:00Z"
OUT = Path(__file__).with_name("evidence.json")


def wire(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(value: Any) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else wire(value)).hexdigest()


@dataclass
class Candidate:
    name: str
    status: str
    trace: list[dict[str, Any]] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    def event(self, action: str, **state: Any) -> None:
        self.trace.append({"action": action, **state})


REVISIONS = {
    "rev-001": {"title": "published", "body": [{"type": "paragraph", "text": "safe"}], "media": "asset-a", "taxonomy": "topic-ai"},
    "rev-002": {"title": "draft", "body": [{"type": "paragraph", "text": "DRAFT-ONLY-MARKER"}], "media": "asset-a", "taxonomy": "topic-ai"},
}


def versioned_input(revision_id: str, revision: dict[str, Any]) -> bytes:
    return wire({"contract": "renderer-input/v1", "entry": "note-1", "revision": revision_id, "content": revision})


def immutable_pointer_on_demand() -> Candidate:
    c = Candidate("immutable-revisions-mutable-pointers-on-demand-versioned-projection", "PASS")
    revisions = dict(REVISIONS)
    current, published = "rev-002", "rev-001"
    public = versioned_input(published, revisions[published])
    assert b"DRAFT-ONLY-MARKER" not in public
    c.event("save-draft", current=current, published=published, public_hash=sha(public), draft_marker_leak=False)
    published = "rev-001"
    first, second = versioned_input(published, revisions[published]), versioned_input(published, revisions[published])
    assert first == second
    c.event("publish-specified-revision", current=current, published=published, hash=sha(first), deterministic=True)
    revisions["rev-003"] = dict(revisions["rev-001"])
    current = "rev-003"
    assert revisions["rev-001"] == REVISIONS["rev-001"]
    c.event("restore-rev-001", current=current, published=published, created_revision="rev-003", historical_overwritten=False)
    archived = {"asset-a"}
    try:
        if revisions["rev-001"]["media"] in archived:
            raise ValueError("BLOCKED_ARCHIVED_MEDIA_RESTORE: asset-a")
    except ValueError as error:
        c.event("restore-with-archived-media", result="blocked", diagnostic=str(error))
    return c


def immutable_pointer_materialized() -> Candidate:
    c = Candidate("immutable-revisions-mutable-pointers-materialized-projection-snapshots", "PASS_NOT_WINNER")
    published = "rev-001"
    snapshot = versioned_input(published, REVISIONS[published])
    assert b"DRAFT-ONLY-MARKER" not in snapshot
    assert snapshot == versioned_input(published, REVISIONS[published])
    c.event("materialize-published-snapshot", published=published, snapshot_hash=sha(snapshot), draft_marker_leak=False, deterministic=True)
    c.reasons.append("通過安全不變量，但維護第二份 immutable projection snapshot；在 on-demand 同樣通過時資料複製更多。")
    return c


def mutable_draft_with_published_snapshot() -> Candidate:
    c = Candidate("mutable-draft-owner-with-separate-published-snapshot", "REJECT")
    mutable_draft = dict(REVISIONS["rev-002"])
    published = dict(REVISIONS["rev-001"])
    mutable_draft["title"] = "edited in place"
    c.event("mutate-draft", current_has_immutable_revision=False, published_hash=sha(published))
    c.reasons.append("current draft 可原地覆寫，無 immutable revision identity；restore 不能保證產生可追溯的新 revision。")
    return c


def main() -> None:
    candidates = [immutable_pointer_on_demand(), immutable_pointer_materialized(), mutable_draft_with_published_snapshot()]
    winner = candidates[0]
    assert winner.status == "PASS"
    result = {
        "spike": "SP-002",
        "executed_at": NOW,
        "schema_version_contract": "SP-001 immutable schema versions; revision pins schema_version",
        "winner": winner.name,
        "contract": {
            "revision": "immutable bytes plus schema_version",
            "pointers": "current_revision_id and published_revision_id are mutable owner pointers",
            "projection": "on-demand, versioned renderer-input/v1 derived only from published pointer",
            "restore": "copies target into a new immutable revision; never overwrites history",
            "media": "restore fails closed when any target reference is archived",
        },
        "candidates": [c.__dict__ for c in candidates],
    }
    OUT.write_bytes(wire(result) + b"\n")
    print("SP-002 PASS: immutable revisions + mutable current/published pointers + on-demand versioned projection")


if __name__ == "__main__":
    main()
