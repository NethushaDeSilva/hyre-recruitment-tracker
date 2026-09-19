import { expect, it } from "vitest";
import { isAllowedOrigin } from "./cors.js";

it("allows the bare production alias", () => {
  expect(isAllowedOrigin("https://hyre-hiring.pages.dev")).toBe(true);
});

it("allows any per-deploy hash subdomain (the wrangler pages deploy URL)", () => {
  expect(isAllowedOrigin("https://2ee01f1b.hyre-hiring.pages.dev")).toBe(true);
});

it("allows any branch preview subdomain", () => {
  expect(isAllowedOrigin("https://screening-correctness.hyre-hiring.pages.dev")).toBe(true);
});

it("allows the local dev ports", () => {
  expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  expect(isAllowedOrigin("http://localhost:4173")).toBe(true);
});

it("allows a missing Origin (same-origin requests don't always send one)", () => {
  expect(isAllowedOrigin(null)).toBe(true);
  expect(isAllowedOrigin(undefined)).toBe(true);
  expect(isAllowedOrigin("")).toBe(true);
});

it("rejects an unrelated domain, even one that merely CONTAINS the suffix as a substring", () => {
  expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  expect(isAllowedOrigin("https://hyre-hiring.pages.dev.evil.com")).toBe(false);
  expect(isAllowedOrigin("https://nothyre-hiring.pages.dev")).toBe(false);
});

it("rejects a non-https attempt to spoof the same hostname", () => {
  expect(isAllowedOrigin("http://2ee01f1b.hyre-hiring.pages.dev")).toBe(false);
});

it("rejects garbage input without throwing", () => {
  expect(isAllowedOrigin("not a url")).toBe(false);
  expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
});
