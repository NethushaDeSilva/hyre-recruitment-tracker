import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OpenPositionModal from "./OpenPositionModal";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "hr-1", role: "HR", name: "Priya" } }) }));
vi.mock("@/data/store", () => ({ addPosition: vi.fn(), updatePosition: vi.fn() }));
vi.mock("@/lib/scoringAuth", () => ({ scoringHeaders: async () => ({}) }));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ open, children, footer }) => (open ? <div>{children}{footer}</div> : null) }));

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const renderModal = () => {
  let tree;
  act(() => { tree = create(<MemoryRouter><OpenPositionModal open onClose={vi.fn()} /></MemoryRouter>); });
  return tree;
};

const requiredSkillsTextarea = (tree) => tree.root.findAllByType("textarea").find((t) => t.props.placeholder === "e.g. React, TypeScript, Node.js");
const niceToHaveTextarea = (tree) => tree.root.findAllByType("textarea").find((t) => t.props.placeholder === "e.g. GraphQL");

it("shows no chip preview before the debounce fires, then shows clean chips 600ms after typing stops", () => {
  const tree = renderModal();
  act(() => { requiredSkillsTextarea(tree).props.onChange({ target: { value: "React, TypeScript" } }); });
  // Not yet debounced — no chips rendered.
  expect(text(tree.toJSON())).not.toContain("TypeScript");
  act(() => { vi.advanceTimersByTime(600); });
  expect(text(tree.toJSON())).toContain("React");
  expect(text(tree.toJSON())).toContain("TypeScript");
  tree.unmount();
});

it("live preview catches a leaked section heading and orphaned conjunction fragments before publishing", () => {
  const tree = renderModal();
  const pasted = "Nice-to-Haves / Edge Factors\nHands-on experience securing AI/ML models, LLM pipelines,\nand AI product integrations (such as Altrium's Sentiva platform).\nFamiliarity with tools like Checkov, Tfsec, or AWS Config.";
  act(() => { niceToHaveTextarea(tree).props.onChange({ target: { value: pasted } }); });
  act(() => { vi.advanceTimersByTime(600); });
  const rendered = text(tree.toJSON());
  expect(rendered).not.toContain("Nice-to-Haves / Edge Factors");
  expect(rendered).not.toMatch(/>and AI product/);
  expect(rendered).not.toMatch(/>or AWS Config/);
  expect(rendered).toContain("AWS Config");
  expect(rendered).toContain("Tfsec");
  tree.unmount();
});

it("keeps a short 'X and Y' compound pair as one chip in the live preview, not split apart", () => {
  const tree = renderModal();
  act(() => { requiredSkillsTextarea(tree).props.onChange({ target: { value: "HTML and CSS" } }); });
  act(() => { vi.advanceTimersByTime(600); });
  expect(text(tree.toJSON())).toContain("HTML and CSS");
  tree.unmount();
});
