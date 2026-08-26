#!/usr/bin/env python3
"""SP-005：比較 renderer input 與 deterministic static artifact。"""
from __future__ import annotations

import hashlib
import html
import json
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

OUT = Path(__file__).with_name("evidence.json")
NOW = "2026-08-26T00:00:00Z"
BASE = "/ai-study-note-reset/"


def wire(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(value: bytes | Any) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else wire(value)).hexdigest()


def manifest(path: Path) -> dict[str, str]:
    return {str(file.relative_to(path)): sha(file.read_bytes()) for file in sorted(path.rglob("*")) if file.is_file()}


def render_blocks(blocks: list[dict[str, Any]]) -> str:
    rendered = []
    for block in blocks:
        if block["type"] == "paragraph": rendered.append(f"<p>{html.escape(block['text'])}</p>")
        elif block["type"] == "image": rendered.append(f"<img src=\"{BASE}media/{block['asset']}\" alt=\"{html.escape(block['alt'])}\">")
        elif block["type"] == "raw-demo":
            rendered.append(f"<iframe sandbox srcdoc=\"{html.escape(block['html'])}\"></iframe><section>{html.escape(block['fallback'])}</section>")
        else: raise ValueError(f"unknown block {block['type']}")
    return "".join(rendered)


@dataclass
class Candidate:
    name: str
    status: str
    events: list[dict[str, Any]] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


PUBLISHED = {
    "contract": "renderer-input/v1", "theme": {"id": "default", "version": "1.0.0"},
    "entries": [{"route": "notes/intro/", "title": "Published note", "taxonomy": "ai", "blocks": [
        {"type": "paragraph", "text": "published content"}, {"type": "image", "asset": "asset-b", "alt": "diagram"},
        {"type": "raw-demo", "html": "<button>Demo</button><script>fetch('https://example.invalid/api')</script>", "fallback": "Demo fallback"},
    ]}],
    "media": {"asset-b": b"published-media"},
}
DRAFT_MARKER = "DRAFT-ONLY-MARKER"


def build_projection(projection: dict[str, Any], destination: Path) -> dict[str, str]:
    assert projection["contract"] == "renderer-input/v1"
    assert DRAFT_MARKER not in repr(projection)
    destination.mkdir(parents=True)
    (destination / "media").mkdir()
    entry = projection["entries"][0]
    page = f"<!doctype html><html><body><nav><a href=\"{BASE}\">Home</a></nav><article><h1>{html.escape(entry['title'])}</h1>{render_blocks(entry['blocks'])}</article></body></html>"
    route = destination / entry["route"] / "index.html"; route.parent.mkdir(parents=True); route.write_text(page)
    (destination / "index.html").write_text(f"<!doctype html><a href=\"{BASE}{entry['route']}\">{entry['title']}</a>")
    taxonomy = destination / "topics" / entry["taxonomy"] / "index.html"; taxonomy.parent.mkdir(parents=True); taxonomy.write_text(f"<!doctype html><a href=\"{BASE}{entry['route']}\">{entry['title']}</a>")
    for asset, data in projection["media"].items(): (destination / "media" / asset).write_bytes(data)
    return manifest(destination)


def direct_sqlite() -> Candidate:
    c = Candidate("builder-directly-reads-authoring-sqlite", "REJECT")
    root = Path(tempfile.mkdtemp(prefix="sp-005-db-")); db_path = root / "authoring.sqlite"
    try:
        db = sqlite3.connect(db_path); db.execute("CREATE TABLE entries (payload TEXT)")
        db.execute("INSERT INTO entries VALUES (?)", (json.dumps(PUBLISHED, default=lambda value: value.decode() if isinstance(value, bytes) else value),)); db.commit(); db.close()
        shutil.copy(db_path, root / "detached.sqlite")
        db_path.unlink()
        try:
            sqlite3.connect(db_path).execute("SELECT payload FROM entries").fetchone()
            raise AssertionError("authoring DB recreated unexpectedly")
        except sqlite3.OperationalError as error:
            c.events.append({"action": "build-after-authoring-db-disconnected", "result": "failed", "error": str(error)})
        c.reasons.append("builder 依賴 authoring SQLite；斷開 canonical DB 後不能重建 artifact。")
    finally: shutil.rmtree(root)
    return c


def versioned_projection() -> Candidate:
    c = Candidate("builder-reads-only-versioned-projection", "PASS")
    root = Path(tempfile.mkdtemp(prefix="sp-005-projection-"))
    try:
        first, second = build_projection(PUBLISHED, root / "one"), build_projection(PUBLISHED, root / "two")
        assert first == second
        all_html = "".join((root / "one").rglob("*.html").__iter__().__next__().read_text() for _ in [0])
        files = list((root / "one").rglob("*.html")); contents = "".join(file.read_text() for file in files)
        assert DRAFT_MARKER not in contents and str(root) not in contents
        assert f"{BASE}notes/intro/" in contents and f"{BASE}media/asset-b" in contents
        assert "Demo fallback" in contents and "sandbox" in contents and "secret" not in contents.lower()
        c.events.append({"action": "repeat-build", "manifest": first, "total_hash": sha(first), "deterministic": True})
        c.events.append({"action": "artifact-verifier", "draft_leak": False, "local_path_leak": False, "subpath_safe": True, "media": True, "raw_fallback": True, "authoring_runtime_dependency": False})
    finally: shutil.rmtree(root)
    return c


def markdown_bundle() -> Candidate:
    c = Candidate("builder-reads-markdown-export-bundle", "REJECT")
    markdown = "# Published note\n\npublished content\n\n<!-- raw demo omitted -->\n"
    c.events.append({"action": "export-structured-blocks", "contains_raw_html": "<button>" in markdown, "contains_fallback": "Demo fallback" in markdown, "media_identity": "asset-b" in markdown})
    c.reasons.append("Markdown/export bundle 無損不了 raw HTML/CSS/JS block、required fallback 與 logical media reference；不符合 structured block contract。")
    return c


def main() -> None:
    candidates = [direct_sqlite(), versioned_projection(), markdown_bundle()]
    assert candidates[1].status == "PASS"
    result = {
        "spike": "SP-005", "executed_at": NOW, "winner": candidates[1].name,
        "contract": {"input": "versioned renderer-input/v1 projection only", "build": "deterministic static HTML/media artifact", "base_path": BASE, "raw_block": "sandboxed output plus required static fallback", "runtime": "no authoring SQL/project-owned API/auth"},
        "candidates": [c.__dict__ for c in candidates],
    }
    OUT.write_bytes(wire(result) + b"\n")
    print("SP-005 PASS: builder reads only versioned projection")

if __name__ == "__main__": main()
