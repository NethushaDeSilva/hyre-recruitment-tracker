// @vitest-environment jsdom
// Regression test for the silent profile-loss bug on the REAL public Apply
// form path (ApplyModal -> applyToPosition), found live 2026-09-24.
//
// CV handling is TWO sequential model calls: validateCvContent (WS3) then
// parseCvContent (WS4). Submit used to unblock as soon as validation passed,
// while the parse was still in flight — and submit()'s profile spread is
// guarded on `parsedProfile`, so submitting in that window wrote an identity
// with NO name, skills, education or cvExtractedText. Nothing errored: the
// application was created fine and the candidate later scored a clean 0/100
// with every required skill "missing", reading as unqualified rather than
// unprocessed.
//
// This drives the same path the real form uses (file chosen -> scan -> parse
// -> submit), never a direct Firestore write, and asserts the profile that
// scoring depends on actually reaches applyToPosition().
import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyToPosition: vi.fn(),
  validateCvContent: vi.fn(),
  parseCvContent: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "cand-uid", email: "ravindu123@gmail.com", role: "Candidate" } }),
}));
vi.mock("@/data/store", () => ({
  applyToPosition: (...a) => mocks.applyToPosition(...a),
  logCvRejection: vi.fn(async () => {}),
  useHyreData: () => ({ candidates: [] }),
}));
vi.mock("@/lib/cv-extract", () => ({
  validateCvContent: (...a) => mocks.validateCvContent(...a),
  parseCvContent: (...a) => mocks.parseCvContent(...a),
  healthCheckCvValidator: vi.fn(async () => {}),
  joinNicely: (list) => (list || []).join(", "),
}));
vi.mock("@/lib/file", () => ({
  fileToDataUrl: vi.fn(async () => ({ dataUrl: "data:application/octet-stream;base64,AAA", size: 23198 })),
  validateCvFile: vi.fn(),
  humanSize: () => "22 KB",
  MAX_CV_BYTES: 5_000_000,
  ACCEPTED_CV_TYPES: ".pdf,.docx",
}));
vi.mock("@/lib/emailDomain", () => ({ checkEmailDomain: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ open, children, footer }) => (open ? <div>{children}{footer}</div> : null),
}));

const ApplyModal = (await import("./ApplyModal")).default;

const POSITION = { id: "FD-06", title: "Frontend Developer", status: "Open", requirements: { requiredSkills: ["HTML", "CSS", "JavaScript"] } };

// What validateCvContent returns for a good CV — note it carries the text.
const SCAN_PASSED = {
  outcome: "passed",
  confidence: 0.95,
  reason: "The document contains contact details, skills, experience and education.",
  missingSections: [],
  needsReview: false,
  truncationApplied: false,
  truncationStrategy: null,
  text: "RAVINDU KARUNARATNA\nSkills: HTML, CSS, JavaScript, React\nBSc (Hons) Software Engineering",
};
const PROFILE = {
  fullName: "RAVINDU KARUNARATNA",
  email: "ravindu123@gmail.com",
  phone: "0125631254",
  location: "Colombo",
  skills: ["HTML", "CSS", "JavaScript", "React"],
  education: [{ awardType: "BSc (Hons)", field: "Software Engineering", institution: "UoC", year: "2020" }],
  experience: [{ title: "Frontend Developer", company: "Acme", startDate: "2021-03", endDate: "", summary: "" }],
  certifications: [],
  languages: [],
  totalYearsExperience: 4,
};

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const text = (node) => (typeof node === "string" ? node : (node?.children || []).map(text).join(""));
const fileInput = (tree) => tree.root.findAllByType("input").find((i) => i.props.type === "file");
const inputByPlaceholder = (tree, ph) => tree.root.findAllByType("input").find((i) => i.props.placeholder === ph);
const submitButton = (tree) => tree.root.findAllByType("button").find((b) => /Submit application|Reading your CV/.test(text(b)));

async function renderAndFillForm() {
  let tree;
  await act(async () => { tree = create(<ApplyModal open position={POSITION} onClose={vi.fn()} onApplied={vi.fn()} />); });
  await act(async () => { inputByPlaceholder(tree, "name@email.com").props.onChange({ target: { value: "ravindu123@gmail.com" } }); });
  await act(async () => { inputByPlaceholder(tree, "+94 7X XXX XXXX").props.onChange({ target: { value: "0125631254" } }); });
  return tree;
}

beforeEach(() => {
  mocks.applyToPosition.mockReset().mockResolvedValue(undefined);
  mocks.validateCvContent.mockReset();
  mocks.parseCvContent.mockReset();
});

it("blocks submission while the CV profile parse is still in flight, instead of silently dropping the profile", async () => {
  mocks.validateCvContent.mockResolvedValue(SCAN_PASSED);
  const parse = deferred();
  mocks.parseCvContent.mockReturnValue(parse.promise);

  const tree = await renderAndFillForm();
  // Choose a CV — validation resolves, the parse deliberately does NOT yet.
  await act(async () => {
    fileInput(tree).props.onChange({ target: { files: [{ name: "cv.docx", size: 23198 }], value: "" } });
  });

  // Validation has passed, but the parse is still running: submit must be held.
  expect(text(submitButton(tree))).toContain("Reading your CV");
  expect(submitButton(tree).props.disabled).toBe(true);

  // Even if a click gets through, nothing is written.
  await act(async () => { await submitButton(tree).props.onClick?.(); });
  expect(mocks.applyToPosition).not.toHaveBeenCalled();

  // Now let the parse finish — submit unblocks.
  await act(async () => { parse.resolve(PROFILE); await parse.promise; });
  expect(submitButton(tree).props.disabled).toBe(false);
  tree.unmount();
});

it("sends the full parsed profile AND the extracted CV text through the real apply path, so scoring has something to score", async () => {
  mocks.validateCvContent.mockResolvedValue(SCAN_PASSED);
  mocks.parseCvContent.mockResolvedValue(PROFILE);

  const tree = await renderAndFillForm();
  await act(async () => {
    fileInput(tree).props.onChange({ target: { files: [{ name: "cv.docx", size: 23198 }], value: "" } });
  });
  await act(async () => { await submitButton(tree).props.onClick(); });

  expect(mocks.applyToPosition).toHaveBeenCalledTimes(1);
  const payload = mocks.applyToPosition.mock.calls[0][0];
  // The exact fields rescoreApplied() reads off the identity when scoring.
  expect(payload.cvExtractedText).toBe(SCAN_PASSED.text);
  expect(payload.skills).toBe("HTML, CSS, JavaScript, React");
  expect(payload.education).toHaveLength(1);
  expect(payload.totalYearsExperience).toBe(4);
  expect(payload.name).toBe("RAVINDU KARUNARATNA");
  tree.unmount();
});

it("still keeps the extracted CV text when the profile parse legitimately fails (a failed parse must not block, but must not lose the text either)", async () => {
  mocks.validateCvContent.mockResolvedValue(SCAN_PASSED);
  mocks.parseCvContent.mockResolvedValue(null); // parse failed — allowed, by design

  const tree = await renderAndFillForm();
  await act(async () => {
    fileInput(tree).props.onChange({ target: { files: [{ name: "cv.docx", size: 23198 }], value: "" } });
  });
  // A FAILED parse must not hold submission hostage.
  expect(submitButton(tree).props.disabled).toBe(false);
  await act(async () => { await submitButton(tree).props.onClick(); });

  const payload = mocks.applyToPosition.mock.calls[0][0];
  expect(payload.cvExtractedText).toBe(SCAN_PASSED.text); // text survives even with no profile
  expect(payload.skills).toBeUndefined(); // profile genuinely absent — never guessed at
  tree.unmount();
});
