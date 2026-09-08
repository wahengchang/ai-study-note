import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserBootstrapState } from "../../../apps/authoring-api/browser-bootstrap.js";

function deterministicRandom(size: number): Uint8Array {
  return new Uint8Array(size).fill(7);
}

test("proof 以 monotonic 5 秒、socket replacement 與 first mint consumption 運作", () => {
  let now = 0;
  const state = createBrowserBootstrapState({ now: () => now, random: deterministicRandom });
  const socket = {};
  state.grantProof(socket, { generation: 1, proofNonce: "a".repeat(43) });
  state.grantProof(socket, { generation: 1, proofNonce: "b".repeat(43) });
  now = 4_999;
  const replaced = state.mint(socket, { generation: 1, proofNonce: "b".repeat(43) });
  assert.notEqual(replaced, undefined, "same socket 的新 proof 取代舊 proof");
  assert.equal(state.mint(socket, { generation: 1, proofNonce: "b".repeat(43) }), undefined, "first schema-valid mint attempt consumes grant");

  now = 5_000;
  state.grantProof(socket, { generation: 1, proofNonce: "c".repeat(43) });
  now = 9_999;
  assert.notEqual(state.mint(socket, { generation: 1, proofNonce: "c".repeat(43) }), undefined);
  state.grantProof(socket, { generation: 1, proofNonce: "d".repeat(43) });
  now = 14_999;
  assert.equal(state.mint(socket, { generation: 1, proofNonce: "d".repeat(43) }), undefined);
});

test("ticket 60 秒 boundary 與 delete-before-response one-shot consume", () => {
  let now = 0;
  const state = createBrowserBootstrapState({ now: () => now, random: deterministicRandom });
  const socket = {};
  state.grantProof(socket, { generation: 4, proofNonce: "n".repeat(43) });
  const minted = state.mint(socket, { generation: 4, proofNonce: "n".repeat(43) });
  assert.notEqual(minted, undefined);
  if (minted === undefined) return;
  now = 59_999;
  assert.equal(state.consume({ ticket: minted.ticket, generation: 4 }), true);
  assert.equal(state.consume({ ticket: minted.ticket, generation: 4 }), false);

  now = 100_000;
  state.grantProof(socket, { generation: 4, proofNonce: "x".repeat(43) });
  const second = state.mint(socket, { generation: 4, proofNonce: "x".repeat(43) });
  assert.notEqual(second, undefined);
  if (second === undefined) return;
  now = 160_000;
  assert.equal(state.consume({ ticket: second.ticket, generation: 4 }), false);
});

test("generation mismatch 同樣 consume ticket，避免 replay oracle", () => {
  let now = 0;
  const state = createBrowserBootstrapState({ now: () => now, random: deterministicRandom });
  const socket = {};
  state.grantProof(socket, { generation: 7, proofNonce: "q".repeat(43) });
  const minted = state.mint(socket, { generation: 7, proofNonce: "q".repeat(43) });
  assert.notEqual(minted, undefined);
  if (minted === undefined) return;
  assert.equal(state.consume({ ticket: minted.ticket, generation: 8 }), false);
  assert.equal(state.consume({ ticket: minted.ticket, generation: 7 }), false);
});

test("clear removes both socket proofs and digest-only tickets on listener shutdown", () => {
  const state = createBrowserBootstrapState({ random: deterministicRandom });
  const socket = {};
  state.grantProof(socket, { generation: 1, proofNonce: "z".repeat(43) });
  const minted = state.mint(socket, { generation: 1, proofNonce: "z".repeat(43) });
  assert.notEqual(minted, undefined);
  if (minted === undefined) return;
  state.grantProof(socket, { generation: 1, proofNonce: "y".repeat(43) });
  state.clear();
  assert.equal(state.consume({ ticket: minted.ticket, generation: 1 }), false);
  assert.equal(state.mint(socket, { generation: 1, proofNonce: "y".repeat(43) }), undefined);
});
