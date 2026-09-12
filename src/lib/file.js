// CV handling. The design is uploadCv() straight to Firebase Storage once
// it's configured (see MAX_CV_BYTES below for why that's currently paused —
// contrary to what an earlier version of this comment claimed, provisioning
// a Storage bucket at all now DOES require the Blaze plan, a Google policy
// change discovered live rather than anticipated). Until then, every CV goes
// through fileToDataUrl() — the same legacy base64-in-Firestore path
// candidates who applied before Storage existed already used, so their CVs
// still open/download correctly with no migration. Open/download handle BOTH
// data URLs and Storage URLs, so nothing breaks either way once Storage
// resumes.
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, firebaseReady } from "@/firebase/config";

// TEMPORARY (as of 2026-09-12): Firebase Storage needs the Blaze plan just to
// provision a bucket, which isn't enabled on this project (no billing) — see
// ApplyModal.jsx's submit(). Every CV currently goes through the legacy
// base64-in-Firestore path instead, so this cap protects Firestore's ~1MB
// per-document limit rather than matching storage.rules' 5MB (that value is
// what to raise this back to once Storage is provisioned — Storage has no
// such ceiling). Base64 inflates a file by ~4/3, and the candidate identity
// document also carries education/experience/skills/cvExtractedText
// alongside the CV itself — 500KB of raw file leaves comfortable headroom
// under 1MB once all of that is accounted for.
export const MAX_CV_BYTES = 500 * 1024;
export const ACCEPTED_CV_TYPES = ".pdf,.doc,.docx";

// Allowed CV file extensions (the reliable signal in the browser; MIME types for
// .doc/.docx are inconsistent across systems).
const ALLOWED_EXT = ["pdf", "doc", "docx"];
const extOf = (name) => String(name).split(".").pop().toLowerCase();

// A legacy base64 data URL we consider safe to open/store (PDF / Word / image).
// Without this gate a crafted `data:text/html…` could run script in our origin.
const SAFE_CV_DATA =
  /^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpe?g));base64,/i;

// A Firebase Storage download URL (served cross-origin with a real Content-Type,
// so it can't execute in our origin).
const SAFE_CV_HTTPS =
  /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com|[a-z0-9.-]+\.firebasestorage\.app)\//i;

/** True for a CV URL we consider safe to open/download (Storage URL or safe data URL). */
export function isSafeCvDataUrl(url) {
  return typeof url === "string" && (SAFE_CV_HTTPS.test(url) || SAFE_CV_DATA.test(url));
}

export function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Throw a friendly Error if the file is the wrong type or too big. */
export function validateCvFile(file) {
  if (!ALLOWED_EXT.includes(extOf(file.name))) {
    throw new Error("Only PDF, DOC or DOCX files are accepted as a CV.");
  }
  if (file.size > MAX_CV_BYTES) {
    throw new Error(`That file is ${humanSize(file.size)}. Please upload a CV under ${humanSize(MAX_CV_BYTES)}.`);
  }
  return true;
}

// Strip anything but a safe filename so a crafted name can't wander paths.
const safeName = (name) => String(name || "cv").replace(/[^\w.\- ]+/g, "_").slice(-120);

/**
 * Upload a CV to Firebase Storage under cvs/{uid}/… and return its download URL.
 * Returns { url, name, size, path }. Requires Firebase to be configured.
 *
 * WS3 note: ApplyModal only calls this once cv-extract.js's validateCvContent()
 * has actually passed — a rejected file is never uploaded, so the orphaning
 * risk this comment used to flag (files uploaded before validation existed)
 * no longer applies to anything submitted from here on. It could still apply
 * to any uploads made during the pre-WS3 window, if this ever ran in
 * production before WS3 shipped — worth a one-off Storage sweep if so, not an
 * ongoing concern.
 */
export async function uploadCv(file, { uid } = {}) {
  validateCvFile(file);
  if (!firebaseReady || !storage) {
    throw new Error("File storage isn't configured. Please try again later.");
  }
  const owner = uid || "anon";
  // A stable-ish unique path without Date.now() collisions across a session.
  const unique = `${Math.round(performance.now())}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `cvs/${owner}/${unique}-${safeName(file.name)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, name: file.name, size: file.size, path };
}

/**
 * Read a File into a base64 data URL (used only in mock/demo mode when Firebase
 * isn't configured). Rejects if it's over the size cap or an unsafe type.
 * Returns { dataUrl, name, size }.
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      validateCvFile(file);
    } catch (err) {
      reject(err);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file. Please try again."));
    reader.onload = () => {
      if (!SAFE_CV_DATA.test(reader.result)) {
        reject(new Error("Only PDF, Word or image files are accepted as a CV."));
        return;
      }
      resolve({ dataUrl: reader.result, name: file.name, size: file.size });
    };
    reader.readAsDataURL(file);
  });
}

/** Trigger a browser download of a CV (Storage URL or legacy data URL). */
export function downloadDataUrl(url, filename) {
  if (!isSafeCvDataUrl(url)) return; // never hand the browser an untrusted type
  const a = document.createElement("a");
  a.href = url;
  a.download = String(filename || "cv").replace(/[\\/]/g, "_");
  a.rel = "noopener";
  if (SAFE_CV_HTTPS.test(url)) a.target = "_blank"; // cross-origin: opens/downloads in a new tab
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Open a CV in a new browser tab (Storage URL or legacy data URL). */
export function openDataUrl(url) {
  if (!isSafeCvDataUrl(url)) return; // refuse anything but a known-safe type
  if (SAFE_CV_HTTPS.test(url)) {
    // Storage URL: a plain new-tab navigation — never parsed as HTML in our origin.
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  // Legacy data URL: build an iframe via the DOM so it's assigned as a property
  // and never parsed as HTML (closes the old document.write injection hole).
  const win = window.open();
  if (!win) return;
  const doc = win.document;
  const frame = doc.createElement("iframe");
  frame.setAttribute("style", "border:0;width:100%;height:100vh");
  frame.src = url;
  (doc.body || doc.documentElement).appendChild(frame);
}
