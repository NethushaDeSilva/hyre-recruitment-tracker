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

it("Description, Required skills and Nice-to-have are large resizable textareas, not single-line inputs", () => {
  const tree = renderModal();
  const description = tree.root.findAllByType("textarea").find((t) => t.props.placeholder?.startsWith("Describe the actual responsibilities"));
  expect(description.props.rows).toBeGreaterThanOrEqual(6); // ~200px worth of lines
  expect(description.props.className).toContain("min-h-[200px]");
  expect(requiredSkillsTextarea(tree).props.className).toContain("min-h-[110px]");
  expect(niceToHaveTextarea(tree).props.className).toContain("min-h-[110px]");
  tree.unmount();
});

it("a full multi-paragraph description paste is preserved verbatim (this field is display-only, never parsed into a list)", () => {
  const tree = renderModal();
  const findDescription = () => tree.root.findAllByType("textarea").find((t) => t.props.placeholder?.startsWith("Describe the actual responsibilities"));
  const pasted = "We're hiring a Senior Backend Engineer to own our payments platform.\n\nResponsibilities:\n- Design and scale our core ledger service\n- Mentor two mid-level engineers\n- Partner with Product on the Q3 roadmap\n\nThis role reports to the VP of Engineering and is based in Colombo.";
  act(() => { findDescription().props.onChange({ target: { value: pasted } }); });
  expect(findDescription().props.value).toBe(pasted);
  tree.unmount();
});

it("a full multi-line skills list (one skill per line, Word/paste style) still parses into the same clean chips as a comma list", () => {
  const tree = renderModal();
  const pasted = "React\nTypeScript\nNode.js\nPostgreSQL\nDocker";
  act(() => { requiredSkillsTextarea(tree).props.onChange({ target: { value: pasted } }); });
  act(() => { vi.advanceTimersByTime(600); });
  const rendered = text(tree.toJSON());
  for (const skill of ["React", "TypeScript", "Node.js", "PostgreSQL", "Docker"]) expect(rendered).toContain(skill);
  tree.unmount();
});
