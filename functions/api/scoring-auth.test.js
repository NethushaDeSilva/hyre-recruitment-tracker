import { it, expect } from "vitest";
import { onRequestPost as batch, onRequestOptions as batchOptions } from "./rescore-vacancy.js";
import { onRequestPost as single, onRequestOptions as singleOptions } from "./score-application.js";

it.each([batch, single])("rejects scoring without a token even without an Origin header", async handler => {
  const request = new Request("https://hyre-hiring.pages.dev/api/test", { method: "POST", body: "{}" });
  expect((await handler({ request, env: {} })).status).toBe(401);
});
it.each([batchOptions, singleOptions])("allows Authorization in valid CORS preflight without requiring credentials", async handler => {
  const response = await handler({ request: new Request("https://hyre-hiring.pages.dev/api/test", { method: "OPTIONS", headers: { Origin: "https://hyre-hiring.pages.dev" } }) });
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
});
