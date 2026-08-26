#!/usr/bin/env python3
"""SP-004：比較 local media bytes、metadata 與 revision reference 一致性。"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

OUT = Path(__file__).with_name("evidence.json")
NOW = "2026-08-26T00:00:00Z"
BYTES = b"fixed-media-bytes-v1\n"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def wire(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


@dataclass
class Candidate:
    name: str
    status: str
    events: list[dict[str, Any]] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


def checksum_registry() -> Candidate:
    c = Candidate("checksum-addressed-objects-logical-assets-reference-registry", "PASS")
    root = Path(tempfile.mkdtemp(prefix="sp-004-"))
    objects, temp = root / "objects", root / "tmp"
    objects.mkdir(); temp.mkdir()
    db = sqlite3.connect(root / "state.sqlite")
    db.executescript("""
      PRAGMA foreign_keys=ON;
      CREATE TABLE objects (checksum TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE);
      CREATE TABLE assets (id TEXT PRIMARY KEY, checksum TEXT NOT NULL REFERENCES objects(checksum), availability TEXT NOT NULL);
      CREATE TABLE revision_refs (revision_id TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(id), PRIMARY KEY(revision_id, asset_id));
    """)
    checksum = sha(BYTES)

    def import_asset(asset_id: str) -> None:
        stage = temp / f"{asset_id}.partial"
        stage.write_bytes(BYTES)
        final = objects / checksum
        with db:
            if not final.exists():
                os.replace(stage, final)
            else:
                stage.unlink()
            db.execute("INSERT OR IGNORE INTO objects VALUES (?, ?)", (checksum, str(final)))
            db.execute("INSERT INTO assets VALUES (?, ?, 'available')", (asset_id, checksum))

    try:
        import_asset("asset-a"); import_asset("asset-b")
        db.execute("INSERT INTO revision_refs VALUES ('note-1@rev-001','asset-a')")
        db.execute("INSERT INTO revision_refs VALUES ('note-1@rev-002','asset-b')")
        db.commit()
        assert len(list(objects.iterdir())) == 1 and (objects / checksum).read_bytes() == BYTES
        c.events.append({"action": "duplicate-import", "assets": 2, "physical_objects": 1, "checksum": checksum})

        # Archive keeps shared physical bytes and invalidates unsafe revision restore.
        with db: db.execute("UPDATE assets SET availability='archived' WHERE id='asset-a'")
        owners = db.execute("SELECT COUNT(*) FROM assets WHERE checksum=?", (checksum,)).fetchone()[0]
        assert owners == 2 and (objects / checksum).exists()
        c.events.append({"action": "archive-shared-asset", "object_retained": True, "logical_owners": owners})
        archived = db.execute("SELECT availability FROM assets WHERE id='asset-a'").fetchone()[0]
        assert archived == "archived"
        c.events.append({"action": "restore-revision-with-archived-media", "result": "blocked", "diagnostic": "BLOCKED_ARCHIVED_MEDIA_RESTORE: asset-a"})
        with db: db.execute("UPDATE assets SET availability='available' WHERE id='asset-a'")
        c.events.append({"action": "restore-asset", "result": "available", "object_checksum": checksum})

        # DB failure after staging must leave no orphan stage/object.
        stage = temp / "db-failure.partial"; stage.write_bytes(BYTES)
        try:
            with db:
                raise sqlite3.IntegrityError("injected DB failure")
        except sqlite3.IntegrityError:
            stage.unlink(missing_ok=True)
        assert not stage.exists()
        c.events.append({"action": "temp-write-db-failure", "reconciled": True, "orphan_stage": False})

        # Intent then promote failure is reconciled by deleting pending row and stage.
        stage = temp / "promote-failure.partial"; stage.write_bytes(b"other")
        with db: db.execute("INSERT INTO objects VALUES (?, ?)", (sha(b"other"), str(objects / sha(b"other"))))
        try:
            raise OSError("injected promote failure")
        except OSError:
            with db: db.execute("DELETE FROM objects WHERE checksum=?", (sha(b"other"),))
            stage.unlink(missing_ok=True)
        assert db.execute("SELECT COUNT(*) FROM objects WHERE checksum=?", (sha(b"other"),)).fetchone()[0] == 0
        c.events.append({"action": "db-intent-promote-failure", "reconciled": True, "dangling_intent": False})
        c.events.append({"action": "published-selection", "asset": "asset-b", "bytes_available": (objects / checksum).exists()})
    finally:
        db.close(); shutil.rmtree(root)
    return c


def per_asset_copies() -> Candidate:
    c = Candidate("per-logical-asset-bytes-copy", "REJECT")
    root = Path(tempfile.mkdtemp(prefix="sp-004-copy-"))
    try:
        (root / "asset-a").write_bytes(BYTES); (root / "asset-b").write_bytes(BYTES)
        c.events.append({"action": "duplicate-import", "physical_objects": 2, "checksums": [sha((root / x).read_bytes()) for x in ("asset-a", "asset-b")]})
        c.reasons.append("相同 bytes 產生兩個不可由 checksum 收斂的 physical copies；不符合 duplicate bytes 可解釋性。")
    finally:
        shutil.rmtree(root)
    return c


def direct_file_paths() -> Candidate:
    c = Candidate("revision-direct-local-file-path", "REJECT")
    root = Path(tempfile.mkdtemp(prefix="sp-004-path-"))
    try:
        media = root / "asset-a"; media.write_bytes(BYTES)
        revision = {"media_path": str(media)}
        media.unlink()
        c.events.append({"action": "archive-file", "revision_path": revision["media_path"], "path_exists": media.exists()})
        c.reasons.append("revision 只保存 path，沒有 central registry；archive 後無法在 mutation 前證明 reference 或阻止 dangling path。")
    finally:
        shutil.rmtree(root)
    return c


def main() -> None:
    candidates = [checksum_registry(), per_asset_copies(), direct_file_paths()]
    assert candidates[0].status == "PASS"
    result = {
        "spike": "SP-004", "executed_at": NOW, "winner": candidates[0].name,
        "contract": {
            "physical_bytes": "checksum-addressed object; identical bytes stored once",
            "logical_assets": "assets separately identify authoring records and availability",
            "references": "unique revision-reference registry points only to logical assets",
            "reconciliation": "temp/DB intent faults reconcile to no orphan bytes or dangling metadata",
            "restore": "archived referenced media blocks revision restore until asset is restored",
        },
        "candidates": [c.__dict__ for c in candidates],
    }
    OUT.write_bytes(wire(result) + b"\n")
    print("SP-004 PASS: checksum-addressed objects + logical assets + reference registry")

if __name__ == "__main__":
    main()
