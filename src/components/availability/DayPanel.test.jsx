import React from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import DayPanel from "./DayPanel";
import { emptyDay } from "@/lib/weeklyAvailability";

const noValidation = { errors: [], warnings: [] };
const buttons = (tree) => tree.root.findAllByType("button");
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));

it('renders "Remove this day" on Saturday and Sunday, and NEVER on a weekday — not hidden, not disabled, absent from the DOM', () => {
  for (const key of ["sat", "sun"]) {
    const tree = create(<DayPanel dayKey={key} day={emptyDay()} validation={noValidation} onAddRow={vi.fn()} onChangeRow={vi.fn()} onRemoveRow={vi.fn()} onRemoveDay={vi.fn()} onRestoreDay={vi.fn()} />);
    expect(buttons(tree).some((b) => text(b) === "Remove this day")).toBe(true);
    tree.unmount();
  }
  for (const key of ["mon", "tue", "wed", "thu", "fri"]) {
    const tree = create(<DayPanel dayKey={key} day={emptyDay()} validation={noValidation} onAddRow={vi.fn()} onChangeRow={vi.fn()} onRemoveRow={vi.fn()} onRemoveDay={vi.fn()} onRestoreDay={vi.fn()} />);
    expect(buttons(tree).some((b) => text(b) === "Remove this day")).toBe(false);
    tree.unmount();
  }
});

it("shows the empty-state copy and calls onRemoveDay on click (weekend only)", () => {
  const onRemoveDay = vi.fn();
  const tree = create(<DayPanel dayKey="sat" day={emptyDay()} validation={noValidation} onAddRow={vi.fn()} onChangeRow={vi.fn()} onRemoveRow={vi.fn()} onRemoveDay={onRemoveDay} onRestoreDay={vi.fn()} />);
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain("No available times set for this day.");
  expect(rendered).not.toContain("blocked");
  buttons(tree).find((b) => text(b) === "Remove this day").props.onClick();
  expect(onRemoveDay).toHaveBeenCalled();
  tree.unmount();
});

it("a removed day (enabled:false) shows the muted message + Restore button instead of the available-times section", () => {
  const onRestoreDay = vi.fn();
  const tree = create(<DayPanel dayKey="sun" day={{ enabled: false, available: [] }} validation={noValidation} onAddRow={vi.fn()} onChangeRow={vi.fn()} onRemoveRow={vi.fn()} onRemoveDay={vi.fn()} onRestoreDay={onRestoreDay} />);
  expect(text(tree.root.findByType("p"))).toBe("You are not working on Sundays.");
  expect(JSON.stringify(tree.toJSON())).not.toContain("Available times");
  const restore = buttons(tree).find((b) => text(b).includes("Restore Sunday"));
  expect(restore).toBeTruthy();
  restore.props.onClick();
  expect(onRestoreDay).toHaveBeenCalled();
  tree.unmount();
});

it("surfaces a row error at the right index", () => {
  const day = { enabled: true, available: [{ start: "09:00", end: "12:00" }] };
  const validation = { errors: [{ list: "available", index: 0, message: "Overlaps another available range on this day." }], warnings: [] };
  const tree = create(<DayPanel dayKey="mon" day={day} validation={validation} onAddRow={vi.fn()} onChangeRow={vi.fn()} onRemoveRow={vi.fn()} onRemoveDay={vi.fn()} onRestoreDay={vi.fn()} />);
  expect(JSON.stringify(tree.toJSON())).toContain("Overlaps another available range on this day.");
  tree.unmount();
});
