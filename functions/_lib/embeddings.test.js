import { describe, it, expect } from "vitest";
import { runEmbeddings } from "./embeddings.js";

describe("complete ordered embeddings", () => {
  it("chunks 205 inputs in order, retaining duplicates", async () => {
    const calls = [];
    const env = { AI: { run: async (_, { text }) => {
      calls.push(text);
      return { data: text.map(t => [Number(t), 1]) };
    } } };
    const texts = Array.from({ length: 205 }, (_, i) => String(i % 150));
    const result = await runEmbeddings(env, texts);
    expect(calls.map(c => c.length)).toEqual([100, 100, 5]);
    expect(result.map(v => v[0])).toEqual(texts.map(Number));
  });
  it("rejects a later count mismatch instead of returning partial vectors", async () => {
    let call = 0;
    const env = { AI: { run: async (_, { text }) => ({ data: ++call === 2 ? [] : text.map(() => [1, 0]) }) } };
    await expect(runEmbeddings(env, Array(101).fill("text"))).rejects.toThrow(/shape|count/i);
  });
  it("accepts long text and marks the corresponding vector as truncated", async () => {
    const env = { AI: { run: async (_, { text }) => {
      expect(text.map(t => t.length)).toEqual([2000, 5]);
      return { data: [[1, 0], [0, 1]] };
    } } };
    const vectors = await runEmbeddings(env, ["x".repeat(2001), "short"]);
    expect(vectors[0].inputTruncated).toBe(true);
    expect(vectors[1].inputTruncated).not.toBe(true);
  });
  it("does not silently filter invalid input and shift positional results", async () => {
    await expect(runEmbeddings({}, ["valid", ""])).rejects.toThrow(/input/i);
  });
});
