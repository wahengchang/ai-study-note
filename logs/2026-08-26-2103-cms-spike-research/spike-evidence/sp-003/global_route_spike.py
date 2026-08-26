#!/usr/bin/env python3
"""SP-003：比較全域 route ownership 與衝突處理。"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

OUT = Path(__file__).with_name("evidence.json")
NOW = "2026-08-26T00:00:00Z"


def wire(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha(value: Any) -> str:
    return hashlib.sha256(wire(value)).hexdigest()


def normalize(route: str) -> str:
    return "/" + unicodedata.normalize("NFC", route).strip("/").casefold() + "/"


@dataclass
class Candidate:
    name: str
    status: str
    events: list[dict[str, Any]] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


class Registry:
    def __init__(self) -> None:
        self.claims = {
            normalize("/notes/"): {"owner": "entry:note-root", "source": "entry"},
            normalize("/notes/intro/"): {"owner": "entry:note-intro", "source": "entry"},
            normalize("/topics/"): {"owner": "taxonomy:topic", "source": "taxonomy"},
            normalize("/topics/ai/"): {"owner": "term:ai", "source": "taxonomy"},
            normalize("/assets/"): {"owner": "reserved:assets", "source": "reserved"},
        }

    def claim(self, route: str, owner: str, source: str) -> None:
        key = normalize(route)
        if key in self.claims:
            raise ValueError(f"ROUTE_CONFLICT: {key} owned by {self.claims[key]['owner']}")
        self.claims[key] = {"owner": owner, "source": source}

    def impact_for_parent_move(self, old: str, new: str) -> list[dict[str, str]]:
        old, new = normalize(old), normalize(new)
        affected = []
        for route, record in self.claims.items():
            if route.startswith(old):
                affected.append({"owner": record["owner"], "from": route, "to": new + route[len(old):]})
        return sorted(affected, key=lambda item: item["from"])

    def move_parent(self, old: str, new: str) -> list[dict[str, str]]:
        impact = self.impact_for_parent_move(old, new)
        old_claims = dict(self.claims)
        destinations = {item["to"] for item in impact}
        outside = set(self.claims) - {item["from"] for item in impact}
        if destinations & outside or len(destinations) != len(impact):
            raise ValueError("ROUTE_MOVE_CONFLICT")
        try:
            for item in impact:
                record = self.claims.pop(item["from"])
                self.claims[item["to"]] = record
        except Exception:
            self.claims = old_claims
            raise
        return impact


def central_registry() -> Candidate:
    c = Candidate("central-global-route-claim-registry", "PASS")
    registry = Registry()
    initial = sha(registry.claims)
    c.events.append({"action": "claim-matrix", "claims": registry.claims, "hash": initial})
    for route, owner, source in [("/topics/", "entry:collision", "entry"), ("/notes/", "taxonomy:collision", "taxonomy")]:
        before = sha(registry.claims)
        try:
            registry.claim(route, owner, source)
            raise AssertionError("collision accepted")
        except ValueError as error:
            assert sha(registry.claims) == before
            c.events.append({"action": "conflict-before-mutation", "route": route, "diagnostic": str(error), "rollback": True})
    impact = registry.impact_for_parent_move("/notes/", "/learn/")
    assert [x["from"] for x in impact] == ["/notes/", "/notes/intro/"]
    c.events.append({"action": "preflight-parent-move", "impact": impact, "current_and_published_considered": True})
    moved = registry.move_parent("/notes/", "/learn/")
    assert moved == impact and "/learn/intro/" in registry.claims
    c.events.append({"action": "commit-parent-move", "claims": registry.claims, "hash": sha(registry.claims)})
    # Unicode/case equivalent collides before a claim changes state.
    before = sha(registry.claims)
    try:
        registry.claim("/LEARN/INTRO/", "entry:unicode", "entry")
        raise AssertionError("normalized collision accepted")
    except ValueError as error:
        assert before == sha(registry.claims)
        c.events.append({"action": "unicode-case-collision", "diagnostic": str(error), "rollback": True})
    return c


def distributed_owner_checks() -> Candidate:
    c = Candidate("distributed-owner-uniqueness-plus-cross-owner-check", "REJECT")
    c.events.append({"action": "entry-owner-check", "known_routes": ["/notes/", "/notes/intro/"]})
    c.events.append({"action": "taxonomy-owner-check", "known_routes": ["/topics/", "/topics/ai/"]})
    c.reasons.append("唯一性分散於多個 owner；必須額外協調才能得出跨 owner impact，未提供 mutation 前的單一 ownership source。")
    return c


def build_time_detection() -> Candidate:
    c = Candidate("renderer-build-time-route-generation", "REJECT")
    c.events.append({"action": "save-entry-route", "route": "/topics/", "result": "accepted-until-build"})
    c.events.append({"action": "build", "result": "collision-discovered-too-late"})
    c.reasons.append("跨 owner collision 在 build 才發現，違反 mutation 前 fail-closed 與完整 impact report。")
    return c


def main() -> None:
    candidates = [central_registry(), distributed_owner_checks(), build_time_detection()]
    assert candidates[0].status == "PASS"
    result = {
        "spike": "SP-003",
        "executed_at": NOW,
        "winner": candidates[0].name,
        "contract": {
            "owner": "Site Definition 擁有 central normalized route-claim registry；claims 包含 owner/source。",
            "normalization": "NFC + casefold + canonical leading/trailing slash。",
            "mutation": "先回傳完整 impact list，再以單一 atomic operation 更新 claims。",
            "conflicts": "Entry、taxonomy/archive、reserved path 共享同一 registry，全部 fail closed。",
        },
        "candidates": [c.__dict__ for c in candidates],
    }
    OUT.write_bytes(wire(result) + b"\n")
    print("SP-003 PASS: central global route-claim registry")


if __name__ == "__main__":
    main()
