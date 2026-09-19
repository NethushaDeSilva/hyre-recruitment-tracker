import { expect, it } from "vitest";
import { positionCode, positionIdFor } from "./positionLifecycle";

it("uses stable readable title codes and non-wrapping sequences", () => {
  expect(positionCode("Regional Manager")).toBe("RM");
  expect(positionCode(" regional   manager ")).toBe("RM");
  expect(positionIdFor(1, "RM")).toBe("RM-01");
  expect(positionIdFor(2, "RM")).toBe("RM-02");
  expect(positionIdFor(100, "RM")).toBe("RM-100");
  expect(positionCode("Backend Dev")).toBe("BD");
  expect(positionCode("Recruiter")).toBe("RECR");
  expect(() => positionIdFor(1, "../RM")).toThrow();
});
