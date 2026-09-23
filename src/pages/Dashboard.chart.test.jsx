import React from "react";
import { act, create } from "react-test-renderer";
import { expect, it } from "vitest";
import { PositionChart } from "./Dashboard";
it("shows closed positions, true zero bars, scrolling and live count changes", () => {
 const positions = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `Position ${i}`, status: i ? "Closed" : "Open" }));
 let tree;
 act(() => { tree = create(<PositionChart positions={positions} candidates={[{ positionId: "p0", stage: "applied" }, { positionId: "p1", stage: "hired" }]} />); });
 expect(tree.root.findAllByProps({ className: "w-28 shrink-0 text-center" })).toHaveLength(12);
 const bars = () => tree.root.findAllByProps({ className: "absolute bottom-0 left-1/2 w-12 -translate-x-1/2 rounded-t bg-primary" });
 expect(bars()[0].props.style.height).toBe("20%");
 expect(bars()[1].props.style.height).toBe("0%");
 expect(tree.root.findByProps({ role: "region" }).props.className).toContain("overflow-x-auto");
 act(() => { tree.update(<PositionChart positions={positions} candidates={[{ positionId: "p0", stage: "applied" }, { positionId: "p0", stage: "screening" }]} />); });
 expect(bars()[0].props.style.height).toBe("40%");
 act(() => tree.unmount());
});
