#!/usr/bin/env python3
"""SP-001：以固定 fixture 比較內容 schema 演進模型。"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FIXED_TIME = "2026-08-26T00:00:00Z"
OUTPUT = Path(__file__).with_name("evidence.json")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def digest(value: bytes | Any) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else canonical_bytes(value)).hexdigest()


@dataclass
class Evidence:
    candidate: str
    passed: bool
    scenarios: list[dict[str, Any]] = field(default_factory=list)
    invariant_failures: list[str] = field(default_factory=list)
    schema_rows: list[dict[str, Any]] = field(default_factory=list)
    revision_rows: list[dict[str, Any]] = field(default_factory=list)

    def record(self, scenario: str, result: str, detail: str) -> None:
        self.scenarios.append({"scenario": scenario, "result": result, "detail": detail})


V1 = {
    "version": 1,
    "fields": {
        "title": {"kind": "text", "required": True},
        "difficulty": {"kind": "integer", "required": False},
        "body": {"kind": "structured-blocks", "required": True},
    },
}

FIXTURE_REVISIONS = (
    ("note-1", "rev-001", {"title": "Immutable start", "difficulty": 1, "body": [{"type": "paragraph", "text": "published"}]}),
    ("note-1", "rev-002", {"title": "Draft update", "difficulty": 2, "body": [{"type": "paragraph", "text": "draft"}]}),
    ("note-2", "rev-001", {"title": "Second entry", "body": [{"type": "paragraph", "text": "other"}]}),
)


class VersionedModel:
    """Candidate 1：immutable schema/revision；revision 明確 pin schema version。"""

    candidate = "immutable-schema-versions-with-revision-pinning"

    def __init__(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(prefix="sp-001-")
        self.db = sqlite3.connect(Path(self.tempdir.name) / "state.sqlite")
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE schema_versions (
              version INTEGER PRIMARY KEY,
              spec_bytes BLOB NOT NULL,
              digest TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL
            );
            CREATE TABLE revisions (
              entry_id TEXT NOT NULL,
              revision_id TEXT NOT NULL,
              schema_version INTEGER NOT NULL REFERENCES schema_versions(version),
              data_bytes BLOB NOT NULL,
              digest TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (entry_id, revision_id)
            );
            CREATE TRIGGER revisions_immutable_update
              BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;
            CREATE TRIGGER revisions_immutable_delete
              BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;
            CREATE TABLE entry_pointers (
              entry_id TEXT PRIMARY KEY,
              current_revision_id TEXT NOT NULL,
              published_revision_id TEXT
            );
            """
        )
        self.insert_schema(V1)
        for entry_id, revision_id, data in FIXTURE_REVISIONS:
            self.insert_revision(entry_id, revision_id, 1, data)
        self.db.execute(
            "INSERT INTO entry_pointers VALUES (?, ?, ?)", ("note-1", "rev-002", "rev-001")
        )
        self.db.execute(
            "INSERT INTO entry_pointers VALUES (?, ?, ?)", ("note-2", "rev-001", None)
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()
        self.tempdir.cleanup()

    def insert_schema(self, spec: dict[str, Any]) -> None:
        spec_bytes = canonical_bytes(spec)
        self.db.execute(
            "INSERT INTO schema_versions VALUES (?, ?, ?, ?)",
            (spec["version"], spec_bytes, digest(spec_bytes), FIXED_TIME),
        )

    def insert_revision(self, entry_id: str, revision_id: str, schema_version: int, data: dict[str, Any]) -> None:
        data_bytes = canonical_bytes(data)
        self.db.execute(
            "INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?)",
            (entry_id, revision_id, schema_version, data_bytes, digest(data_bytes), FIXED_TIME),
        )

    def current_spec(self) -> dict[str, Any]:
        row = self.db.execute("SELECT spec_bytes FROM schema_versions ORDER BY version DESC LIMIT 1").fetchone()
        return json.loads(row[0])

    def transition(self, spec: dict[str, Any], migration: dict[str, Any] | None = None) -> int:
        """建立新 schema；不相容變更必須在同一 transaction 明列 revision backfill。"""
        old = self.current_spec()
        old_fields = old["fields"]
        new_fields = spec["fields"]
        renamed = (migration or {}).get("renamed", {})
        removed = set(old_fields) - set(new_fields)
        permitted_renames = {
            old_key for old_key, new_key in renamed.items()
            if old_key in old_fields and new_key in new_fields
        }
        unaccounted_removals = removed - permitted_renames
        if unaccounted_removals:
            raise ValueError(f"BLOCKED_FIELD_REMOVAL: historical revisions still use {sorted(unaccounted_removals)}")

        changed = [
            key for key in set(old_fields) & set(new_fields) if old_fields[key]["kind"] != new_fields[key]["kind"]
        ]
        required_without_default = [
            key for key, field in new_fields.items()
            if key not in old_fields and field.get("required") and "default" not in field
        ]
        if required_without_default and not migration:
            raise ValueError(f"BLOCKED_REQUIRED_WITHOUT_BACKFILL: {required_without_default}")
        if (changed or permitted_renames) and not migration:
            raise ValueError("BLOCKED_INCOMPATIBLE_CHANGE_REQUIRES_EXPLICIT_MIGRATION")

        with self.db:
            self.insert_schema(spec)
            if migration:
                for migration_row in migration.get("new_revisions", []):
                    self.insert_revision(
                        migration_row["entry_id"], migration_row["revision_id"], spec["version"], migration_row["data"]
                    )
        return spec["version"]

    def snapshot(self) -> tuple[dict[str, str], dict[str, str]]:
        schemas = {
            str(row["version"]): row["digest"]
            for row in self.db.execute("SELECT version, digest FROM schema_versions ORDER BY version")
        }
        revisions = {
            f"{row['entry_id']}@{row['revision_id']}": row["digest"]
            for row in self.db.execute("SELECT entry_id, revision_id, digest FROM revisions ORDER BY entry_id, revision_id")
        }
        return schemas, revisions

    def raw_rows(self, evidence: Evidence) -> None:
        evidence.schema_rows = [dict(row) | {"spec_bytes": row["spec_bytes"].decode()} for row in self.db.execute(
            "SELECT version, spec_bytes, digest, created_at FROM schema_versions ORDER BY version"
        )]
        evidence.revision_rows = [dict(row) | {"data_bytes": row["data_bytes"].decode()} for row in self.db.execute(
            "SELECT entry_id, revision_id, schema_version, data_bytes, digest, created_at FROM revisions ORDER BY entry_id, revision_id"
        )]


def copied_data(entry_id: str, new_title: str | None = None) -> dict[str, Any]:
    data = next(data for e, r, data in FIXTURE_REVISIONS if e == entry_id and r == "rev-001")
    result = json.loads(canonical_bytes(data))
    if new_title:
        result["title"] = new_title
    return result


def run_candidate_one() -> Evidence:
    model = VersionedModel()
    evidence = Evidence(candidate=model.candidate, passed=True)
    before_schemas, before_revisions = model.snapshot()
    try:
        v2 = {"version": 2, "fields": V1["fields"] | {"summary": {"kind": "text", "required": False}}}
        model.transition(v2)
        evidence.record("add-optional-field", "allowed", "v2 新增 optional summary；v1 revision 維持 pin v1")

        v3 = {"version": 3, "fields": v2["fields"] | {"audience": {"kind": "text", "required": True, "default": "general"}}}
        model.transition(v3)
        model.insert_revision("note-1", "rev-003", 3, copied_data("note-1", "Default-backed migration") | {"audience": "general"})
        model.db.commit()
        evidence.record("add-required-field-with-default", "allowed", "只新建 v3 revision；舊 revision bytes 未改寫")

        v4_without_default = {"version": 4, "fields": v3["fields"] | {"reviewer": {"kind": "text", "required": True}}}
        try:
            model.transition(v4_without_default)
            raise AssertionError("required field without explicit backfill was accepted")
        except ValueError as error:
            assert str(error).startswith("BLOCKED_REQUIRED_WITHOUT_BACKFILL")
            evidence.record("add-required-field-without-default", "blocked", str(error))

        v4 = {"version": 4, "fields": v3["fields"] | {"difficulty": {"kind": "select", "required": False, "options": ["beginner", "intermediate", "advanced"]}}}
        transformed = copied_data("note-1", "Difficulty migrated") | {"difficulty": "beginner", "audience": "general"}
        model.transition(v4, {"new_revisions": [{"entry_id": "note-1", "revision_id": "rev-004", "data": transformed}]})
        evidence.record("integer-to-select", "allowed-with-explicit-backfill", "mapping 1→beginner 寫入新 revision；v1 不 coercion")

        v5_fields = dict(v4["fields"])
        difficulty = v5_fields.pop("difficulty")
        v5_fields["level"] = difficulty
        v5 = {"version": 5, "fields": v5_fields}
        renamed = transformed.copy()
        renamed["level"] = renamed.pop("difficulty")
        model.transition(v5, {"renamed": {"difficulty": "level"}, "new_revisions": [{"entry_id": "note-1", "revision_id": "rev-005", "data": renamed}]})
        evidence.record("field-key-rename", "allowed-with-explicit-backfill", "difficulty→level 寫入新 revision；沒有 runtime alias")

        v6 = {"version": 6, "fields": {key: value for key, value in v5_fields.items() if key != "body"}}
        try:
            model.transition(v6)
            raise AssertionError("field removal was accepted")
        except ValueError as error:
            assert str(error).startswith("BLOCKED_FIELD_REMOVAL")
            evidence.record("remove-used-field", "blocked", str(error))

        schema_count_before = model.db.execute("SELECT COUNT(*) FROM schema_versions").fetchone()[0]
        try:
            with model.db:
                failed = {"version": 6, "fields": v5_fields | {"source": {"kind": "text", "required": False}}}
                model.insert_schema(failed)
                model.insert_revision("note-1", "rev-006", 6, {"invalid": object()})
        except TypeError:
            pass
        schema_count_after = model.db.execute("SELECT COUNT(*) FROM schema_versions").fetchone()[0]
        assert schema_count_before == schema_count_after
        evidence.record("failed-migration-rollback", "rolled-back", "schema v6 insert 與無法序列化 revision 同一 transaction，無 partial schema row")

        original = model.db.execute(
            "SELECT data_bytes FROM revisions WHERE entry_id='note-1' AND revision_id='rev-001'"
        ).fetchone()[0]
        model.insert_revision("note-1", "rev-006", 1, json.loads(original))
        model.db.commit()
        restored = model.db.execute(
            "SELECT data_bytes, schema_version FROM revisions WHERE entry_id='note-1' AND revision_id='rev-006'"
        ).fetchone()
        assert restored[0] == original and restored[1] == 1
        evidence.record("restore-old-revision", "allowed-and-traceable", "產生 note-1@rev-006，pin 原 schema v1 且 bytes 等於 rev-001")

        _, after_revisions = model.snapshot()
        for revision_id, original_digest in before_revisions.items():
            assert after_revisions[revision_id] == original_digest
        assert before_schemas["1"] == model.snapshot()[0]["1"]
        evidence.record("historical-byte-digest", "preserved", "所有初始 revision/schema v1 SHA-256 均未變更")
    except Exception as error:
        evidence.passed = False
        evidence.invariant_failures.append(repr(error))
    finally:
        model.raw_rows(evidence)
        model.close()
    return evidence


def run_additive_only() -> Evidence:
    model = VersionedModel()
    evidence = Evidence(candidate="additive-only-schema", passed=False)
    try:
        v2 = {"version": 2, "fields": V1["fields"] | {"summary": {"kind": "text", "required": False}}}
        model.transition(v2)
        evidence.record("add-optional-field", "allowed", "唯一可接受 transition")
        evidence.record("add-required-field-with-default", "blocked", "candidate policy 不允許 required field；無 migration path")
        evidence.record("integer-to-select", "blocked", "candidate policy 不允許 type change；無 migration path")
        evidence.record("field-key-rename", "blocked", "candidate policy 不允許 rename；無 migration path")
        evidence.record("remove-used-field", "blocked", "candidate policy 不允許 removal")
        evidence.invariant_failures.append("不能完成需求明列的 required/type/key evolution，僅能永久拒絕。")
    finally:
        model.raw_rows(evidence)
        model.close()
    return evidence


def run_mutable_schema() -> Evidence:
    evidence = Evidence(candidate="mutable-current-schema-with-runtime-coercion", passed=False)
    original_bytes = canonical_bytes(FIXTURE_REVISIONS[0][2])
    current_schema = V1
    current_schema = {
        "version": 2,
        "fields": current_schema["fields"] | {
            "difficulty": {"kind": "select", "required": False, "options": ["beginner", "intermediate", "advanced"]}
        },
    }
    loaded_historical = json.loads(original_bytes)
    loaded_historical["difficulty"] = "beginner"  # runtime coercion of historical data
    assert canonical_bytes(loaded_historical) != original_bytes
    evidence.record("integer-to-select", "coerced", "rev-001 未 pin schema；runtime 將 1 改解讀為 beginner")
    evidence.invariant_failures.append("同一 historical bytes 在 current schema 改變後產生不同語意；不符合 historical revision 可驗證保存。")
    evidence.schema_rows = [{"version": 2, "spec_bytes": canonical_bytes(current_schema).decode(), "digest": digest(current_schema), "created_at": FIXED_TIME}]
    evidence.revision_rows = [{"entry_id": "note-1", "revision_id": "rev-001", "schema_version": None, "data_bytes": original_bytes.decode(), "digest": digest(original_bytes), "created_at": FIXED_TIME}]
    return evidence


def main() -> None:
    candidates = [run_candidate_one(), run_additive_only(), run_mutable_schema()]
    result = {
        "spike": "SP-001",
        "executed_at": FIXED_TIME,
        "fixture_ids": [f"{entry}@{revision}" for entry, revision, _ in FIXTURE_REVISIONS],
        "winner": "immutable-schema-versions-with-revision-pinning",
        "decision": "採 immutable schema versions，Entry revision 明確 pin schema version；不相容變更只可透過顯式、全有全無的 backfill 產生新 revision。",
        "transition_contract": {
            "allowed": [
                "新增 optional field",
                "新增帶 default 的 required field（只影響新 revision）",
                "type change 與 field-key rename（具顯式 backfill mapping）",
                "restore 舊 revision（產生新的可追溯 revision，保留原 schema pin 與 bytes）",
            ],
            "blocked": [
                "無 backfill 的新增 required field",
                "無 migration 的 type change 或 field-key rename",
                "移除仍由 historical/current/published revision 使用的 field",
                "任何 transaction 內的 partial schema/revision commit",
            ],
        },
        "candidates": [candidate.__dict__ for candidate in candidates],
    }
    OUTPUT.write_bytes(canonical_bytes(result) + b"\n")
    assert candidates[0].passed and not candidates[1].passed and not candidates[2].passed
    print("SP-001 PASS: immutable-schema-versions-with-revision-pinning")
    print(f"Evidence: {OUTPUT}")


if __name__ == "__main__":
    main()
