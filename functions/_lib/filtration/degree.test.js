import { describe, it, expect } from "vitest";
import { classifyDegree, classifyAwardType } from "./degree.js";

describe("classifyDegree", () => {
  it("splits <TYPE> <FIELD> into level and field", () => {
    expect(classifyDegree("BSc Computer Science")).toEqual({ level: 6, field: "Computer Science", recognised: true });
    expect(classifyDegree("MSc Data Analytics")).toEqual({ level: 7, field: "Data Analytics", recognised: true });
    expect(classifyDegree("PhD Physics")).toEqual({ level: 8, field: "Physics", recognised: true });
  });

  it("handles 'Bachelor of'/'Master of'/'Doctor of Philosophy in' forms", () => {
    expect(classifyDegree("Bachelor of Nursing")).toEqual({ level: 6, field: "Nursing", recognised: true });
    expect(classifyDegree("Master of Business Administration")).toEqual({ level: 7, field: "Business Administration", recognised: true });
    expect(classifyDegree("Doctor of Philosophy in Computer Science")).toEqual({ level: 8, field: "Computer Science", recognised: true });
  });

  it("handles whole-name abbreviations with no separate field", () => {
    expect(classifyDegree("MBA")).toEqual({ level: 7, field: "Business Administration", recognised: true });
    expect(classifyDegree("BBA")).toEqual({ level: 6, field: "Business Administration", recognised: true });
    expect(classifyDegree("LLB")).toEqual({ level: 6, field: "Law", recognised: true });
    expect(classifyDegree("PhD")).toEqual({ level: 8, field: null, recognised: true });
  });

  it("is case-insensitive and tolerates extra whitespace", () => {
    expect(classifyDegree("  bsc   computer science  ")).toEqual({ level: 6, field: "computer science", recognised: true });
  });

  it("returns unrecognised rather than guessing for an unknown prefix", () => {
    expect(classifyDegree("Diploma in Accounting")).toEqual({ level: null, field: null, recognised: false });
    expect(classifyDegree("")).toEqual({ level: null, field: null, recognised: false });
  });
});

describe("classifyAwardType", () => {
  it("classifies an award-type-only string (no field text mixed in)", () => {
    expect(classifyAwardType("BSc (Hons)")).toEqual({ level: 6, recognised: true });
    expect(classifyAwardType("Master of Science")).toEqual({ level: 7, recognised: true });
    expect(classifyAwardType("PhD")).toEqual({ level: 8, recognised: true });
    expect(classifyAwardType("Doctor of Philosophy")).toEqual({ level: 8, recognised: true });
  });
  it("matches level indicators anywhere in the string, not just at the start", () => {
    expect(classifyAwardType("Bachelor of Engineering (Hons)")).toEqual({ level: 6, recognised: true });
    expect(classifyAwardType("MBA")).toEqual({ level: 7, recognised: true });
  });
  it("returns unrecognised rather than guessing for an unknown or empty award type", () => {
    expect(classifyAwardType("Higher National Diploma")).toEqual({ level: null, recognised: false });
    expect(classifyAwardType("")).toEqual({ level: null, recognised: false });
    expect(classifyAwardType(null)).toEqual({ level: null, recognised: false });
  });
});
