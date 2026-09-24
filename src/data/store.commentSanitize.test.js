// @vitest-environment jsdom
// Proves addComment() sanitizes the stage-move comment ON SAVE — the rich
// text editor's toolbar only offers bold/italic/lists, but paste_as_text is
// deliberately OFF (so Word formatting survives), which means arbitrary
// pasted HTML (colors, spans, even a script tag via a crafted paste) can
// reach this function. Comments are shown to other users, so sanitizing here
// — not just relying on the toolbar UI — is the actual security boundary.
import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/firebase/config", () => ({ db: {}, firebaseReady: false }));

const { addComment, useHyreData } = await import("./store.js");

const ACTOR = { uid: "hr-uid", role: "HR", name: "HR Person" };

// cand_1 is a SEED_CANDIDATES fixture at stage "applied" on pos_1 (mock mode).
function CommentText({ id }) {
  const { candidates } = useHyreData();
  const cand = candidates.find((c) => c.id === id);
  const cm = (cand?.comments || [])[0];
  return React.createElement("span", null, cm ? cm.text : "");
}

beforeEach(() => {
  vi.resetModules();
});

it("stores ONLY the sanitized HTML — script tag and onclick attribute are gone, allowed formatting survives", async () => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(CommentText, { id: "cand_1" }));
  });
  await act(async () => {
    await addComment("cand_1", {
      text: '<p onclick="steal()"><strong>Great candidate</strong></p><script>alert(document.cookie)</script>',
      actor: ACTOR,
    });
  });
  const stored = tree.root.findByType("span").children.join("");
  expect(stored).toBe("<p><strong>Great candidate</strong></p>");
  expect(stored).not.toContain("<script");
  expect(stored).not.toContain("onclick");
});
