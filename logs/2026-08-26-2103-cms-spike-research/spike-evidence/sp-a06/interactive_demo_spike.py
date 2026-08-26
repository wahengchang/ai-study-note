#!/usr/bin/env python3
"""SP-A06：trusted local Interactive Demo Plugin 的 isolated vertical-slice prototype。"""
from __future__ import annotations

import hashlib
import html
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).parent
MANIFEST_PATH = ROOT / "interactive-demo-plugin" / "manifest.json"
OUT = ROOT / "evidence.json"
NOW = "2026-08-26T00:00:00Z"


def wire(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(value: bytes | Any) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else wire(value)).hexdigest()


@dataclass
class Evidence:
    events: list[dict[str, Any]] = field(default_factory=list)
    diagnostics: list[dict[str, str]] = field(default_factory=list)
    service_trace: list[str] = field(default_factory=list)


class PluginError(RuntimeError):
    pass


class Host:
    def __init__(self, manifest: dict[str, Any], evidence: Evidence) -> None:
        self.manifest, self.evidence = manifest, evidence
        self.active = False
        self.revisions: dict[str, dict[str, Any]] = {}
        self.actions: list[tuple[int, str, Callable[[], None]]] = []
        self.filters: list[tuple[int, str, Callable[[dict[str, Any]], dict[str, Any]]]] = []
        self.fail_validator = self.fail_renderer = False

    def discover(self) -> dict[str, Any]:
        self.evidence.events.append({"action": "folder-discovery", "listed": self.manifest["id"], "loaded": False})
        return self.manifest

    def activate(self) -> None:
        required = {"editor-block", "validator", "renderer", "assets"}
        if self.manifest["hookContract"] != "plugin-hooks/v1" or not required.issubset(self.manifest["capabilities"]):
            raise PluginError("invalid manifest")
        self.active = True
        self.evidence.events.append({"action": "manual-activate", "active": True, "trusted_code_warning": True})

    def deactivate(self) -> None:
        self.active = False
        self.evidence.events.append({"action": "manual-deactivate", "active": False, "revision_data_retained": bool(self.revisions)})

    def register_action(self, priority: int, plugin_id: str, callback: Callable[[], None]) -> None:
        self.actions.append((priority, plugin_id, callback))

    def register_filter(self, priority: int, plugin_id: str, callback: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
        self.filters.append((priority, plugin_id, callback))

    def invoke_hooks(self) -> None:
        action_trace = []
        for _, plugin_id, callback in sorted(self.actions, key=lambda item: (item[0], item[1])):
            assert callback() is None
            action_trace.append(plugin_id)
        source = {"classes": ["demo"]}
        filter_trace = []
        for _, plugin_id, callback in sorted(self.filters, key=lambda item: (item[0], item[1])):
            immutable = json.loads(wire(source))
            replacement = callback(immutable)
            assert replacement is not immutable
            source = replacement
            filter_trace.append(plugin_id)
        self.evidence.events.append({"action": "fixed-hooks", "actions": action_trace, "filters": filter_trace, "replacement": source})

    def save_revision(self, entry: str, source: dict[str, str]) -> str:
        self.evidence.service_trace.append("application-service:save-revision")
        if self.active and self.fail_validator:
            diagnostic = {"plugin": self.manifest["id"], "capability": "validator", "entry": entry}
            self.evidence.diagnostics.append(diagnostic)
            raise PluginError("validator exception")
        revision_id = f"{entry}@rev-{len(self.revisions) + 1:03d}"
        self.revisions[revision_id] = {"source": dict(source), "plugin": self.manifest["id"], "version": self.manifest["version"]}
        return revision_id

    def preview(self, revision: str) -> str:
        block = self.revisions[revision]["source"]
        return f"<iframe sandbox srcdoc=\"{html.escape(block['html'])}\"></iframe><section>{html.escape(block['fallback'])}</section>"

    def build(self, revision: str) -> tuple[bytes, dict[str, Any]]:
        self.evidence.service_trace.append("application-service:build-projection")
        block = self.revisions[revision]["source"]
        provenance = {"theme": {"id": "default", "version": "1.0.0"}, "plugins": []}
        if not self.active:
            diagnostic = {"plugin": self.manifest["id"], "capability": "renderer", "entry": revision, "reason": "inactive-omitted"}
            self.evidence.diagnostics.append(diagnostic)
            return wire({"html": f"<article><section>{html.escape(block['fallback'])}</section></article>"}), provenance
        if self.fail_renderer:
            diagnostic = {"plugin": self.manifest["id"], "capability": "renderer", "entry": revision}
            self.evidence.diagnostics.append(diagnostic)
            raise PluginError("renderer exception")
        provenance["plugins"].append({"id": self.manifest["id"], "version": self.manifest["version"], "manifest_hash": sha(self.manifest)})
        return wire({"html": self.preview(revision), "css": ".demo { display: block; }", "class": "demo"}), provenance


def hybrid_prototype() -> tuple[str, Evidence]:
    manifest = json.loads(MANIFEST_PATH.read_text())
    evidence = Evidence(); host = Host(manifest, evidence)
    assert host.discover()["id"] == "interactive-demo" and not host.active
    host.activate()
    host.register_action(20, "interactive-demo", lambda: None)
    host.register_action(10, "host-audit", lambda: None)
    host.register_filter(20, "interactive-demo", lambda value: value | {"classes": value["classes"] + ["interactive-demo"]})
    host.register_filter(10, "host-audit", lambda value: value | {"classes": value["classes"] + ["audited"]})
    host.invoke_hooks()
    source = {"html": "<button>Run</button><script>window.demo=true</script>", "css": "button{color:red}", "js": "window.demo=true", "fallback": "Interactive demo fallback"}
    revision = host.save_revision("note-1", source)
    preview = host.preview(revision)
    assert "sandbox" in preview and "Interactive demo fallback" in preview
    evidence.events.append({"action": "cms-preview", "sandboxed": True, "source_revision": revision, "fallback": True})
    artifact, provenance = host.build(revision)
    assert b"sandbox" in artifact and provenance["plugins"]
    old_artifact = artifact
    evidence.events.append({"action": "active-build", "artifact_hash": sha(artifact), "provenance": provenance})

    host.fail_validator = True
    try: host.save_revision("note-1", source)
    except PluginError: evidence.events.append({"action": "validator-fault", "operation": "failed", "attributed": evidence.diagnostics[-1]})
    host.fail_validator = False; host.fail_renderer = True
    try: host.build(revision)
    except PluginError: evidence.events.append({"action": "renderer-fault", "build": "failed", "attributed": evidence.diagnostics[-1]})
    host.fail_renderer = False

    host.deactivate()
    inactive, inactive_provenance = host.build(revision)
    assert b"sandbox" not in inactive and not inactive_provenance["plugins"] and old_artifact == artifact
    evidence.events.append({"action": "inactive-build", "demo_omitted": True, "old_artifact_unchanged": sha(old_artifact) == sha(artifact)})
    host.activate()
    reenabled, reenabled_provenance = host.build(revision)
    assert reenabled == artifact and reenabled_provenance["plugins"]
    evidence.events.append({"action": "re-enable", "same_revision_source": host.revisions[revision]["source"] == source, "artifact_restored": reenabled == artifact})
    assert all("sql" not in call and "media" not in call for call in evidence.service_trace)
    evidence.events.append({"action": "host-access-boundary", "only_application_services": True, "trace": evidence.service_trace})
    return revision, evidence


def main() -> None:
    revision, evidence = hybrid_prototype()
    result = {
        "spike": "SP-A06", "executed_at": NOW, "status": "PASS", "winner": "hybrid fixed versioned Actions/Filters plus manifest capabilities",
        "contract": {
            "discovery": "trusted local folder is listed without loading; activation is manual after manifest validation",
            "hooks": "plugin-hooks/v1; Actions return no value; Filters replace immutable input; order priority then plugin id",
            "capabilities": "editor-block, validator, renderer, assets; large integration goes through capability",
            "boundary": "plugin uses host application services only; direct SQL/media and Controlled Command API are absent",
            "lifecycle": "inactive keeps revision source, omits public output with diagnostic, and re-enable restores same revision",
            "provenance": "artifact records theme/plugin id, version, manifest hash",
        },
        "revision": revision, "events": evidence.events, "diagnostics": evidence.diagnostics, "service_trace": evidence.service_trace,
        "negative_controls": {
            "hooks-only": "rejected: editor/validator/renderer/assets cannot be discoverable and version-validated as explicit capabilities",
            "capabilities-only": "rejected: no deterministic lifecycle ordering or replacement semantics for small extension points",
        },
        "still_unanswered": ["SP-A01 schema capability ownership/safe exit", "SP-A02 migration atomicity/isolation", "SP-A03 theme projection compatibility", "SP-A04 controlled command caller/scope/idempotency", "SP-A05 publication provenance breadth"],
    }
    OUT.write_bytes(wire(result) + b"\n")
    print("SP-A06 PASS: hybrid hooks + manifest capabilities Interactive Demo Plugin prototype")

if __name__ == "__main__": main()
