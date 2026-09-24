// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeComment, isSanitizedCommentEmpty } from "./sanitizeHtml";

describe("sanitizeComment — strict allowlist (b/strong, i/em, ul/ol/li, p, br only, no attributes)", () => {
  it("keeps exactly the tags the RichCommentEditor's toolbar can produce", () => {
    const html = "<p>Please <strong>confirm eligibility</strong> before the <em>final</em> round.</p><ul><li>Item one</li><li>Item two</li></ul>";
    expect(sanitizeComment(html)).toBe(html);
  });

  it("strips a script tag entirely — the classic XSS payload", () => {
    expect(sanitizeComment('<p>hi</p><script>alert(document.cookie)</script>')).toBe("<p>hi</p>");
  });

  it("strips an onerror/onclick attribute even on an otherwise-allowed tag", () => {
    expect(sanitizeComment('<p onclick="alert(1)">click me</p>')).toBe("<p>click me</p>");
  });

  it("strips style attributes (Word-pasted colors/fonts) — content survives, styling doesn't", () => {
    expect(sanitizeComment('<p style="color:red;font-family:Wingdings">Looks great</p>')).toBe("<p>Looks great</p>");
  });

  it("strips a disallowed tag (img/table/a/span) but keeps its text content", () => {
    expect(sanitizeComment('<p>See <a href="javascript:alert(1)">this link</a> and <img src=x onerror=alert(1)> and <span class="hl">this</span>.</p>'))
      .toBe("<p>See this link and  and this.</p>");
  });

  it("keeps ordered lists too", () => {
    expect(sanitizeComment("<ol><li>First</li><li>Second</li></ol>")).toBe("<ol><li>First</li><li>Second</li></ol>");
  });

  it("collapses nested formatting inside the allowlist (bold inside a list item)", () => {
    expect(sanitizeComment("<ul><li><strong>Strong candidate</strong> — great communicator</li></ul>"))
      .toBe("<ul><li><strong>Strong candidate</strong> — great communicator</li></ul>");
  });

  it("handles null/undefined/empty input without throwing", () => {
    expect(sanitizeComment(null)).toBe("");
    expect(sanitizeComment(undefined)).toBe("");
    expect(sanitizeComment("")).toBe("");
  });
});

describe("isSanitizedCommentEmpty", () => {
  it("treats a truly empty string as empty", () => {
    expect(isSanitizedCommentEmpty("")).toBe(true);
  });

  it("treats TinyMCE's blank '<p></p>' / '<p><br></p>' as empty, not as real content", () => {
    expect(isSanitizedCommentEmpty("<p></p>")).toBe(true);
    expect(isSanitizedCommentEmpty("<p><br></p>")).toBe(true);
  });

  it("treats real text content as non-empty even when wrapped only in structural tags", () => {
    expect(isSanitizedCommentEmpty("<p>Looks good</p>")).toBe(false);
  });

  it("treats content that is ONLY a script tag (stripped to nothing) as empty", () => {
    expect(isSanitizedCommentEmpty("<script>alert(1)</script>")).toBe(true);
  });
});
