# Hyre — Security notes

This is a plain-English record of the security work on Hyre: what's protecting the
app now, the one thing you still have to do yourself, and the risks we know about
but haven't fully closed. Written so a teammate (or a marker) can follow it.

---

## The most important thing: deploy the Firestore rules

Right now the database is still in **test mode** — that means *anyone on the
internet* with the public API key can read or write every CV, comment and profile.
We proved this earlier with a plain `curl` that came back with real data. That is
the single biggest hole, and it stays open until **you** deploy the new rules.
We wrote the rules ([firestore.rules](firestore.rules)) but we can't deploy them
from here — deploying needs your Firebase login.

**Deploy them (one time) — ORDER MATTERS:**

```bash
npm install -g firebase-tools     # if you don't have it
firebase login                    # opens your browser

# 1) FIRST, while the rules are still open, stamp the staff role docs.
#    The locked rules forbid anyone from granting THEMSELVES a staff role, so
#    HR / Interviewer / Management roles must be written before the lock lands.
#    Skip this and your own staff logins lose all write access after deploy.
node scripts/provision-staff.mjs

# 2) THEN deploy the locked rules.
firebase deploy --only firestore:rules
```

> Why the order? The rules trust `users/{uid}.role` for every permission and
> deliberately block self-assigning a staff role (otherwise any signed-up user
> could make themselves HR). So staff roles are provisioned out-of-band by the
> script above, which must run while Firestore is still open.

### CV files now live in Firebase Storage (needs the Blaze plan)

CVs used to be stored as base64 *inside* the Firestore document — which capped them
at ~700 KB (Firestore's 1 MB doc limit). To accept real, up-to-**5 MB** CVs, uploads
now go to **Firebase Storage** and the candidate doc stores the download URL.

**One-time setup:**

```bash
# 1) Upgrade the project to the Blaze (pay-as-you-go) plan — Storage requires it.
#    Firebase console → ⚙ → Usage and billing → Modify plan. (Has a free tier;
#    needs a card on file.)
# 2) Enable Storage: Firebase console → Build → Storage → Get started.
# 3) Deploy the Storage rules (owner-only writes, 5 MB + CV-type limits):
firebase deploy --only storage
```

Rules live in [storage.rules](storage.rules): a signed-in user can upload only into
their own `cvs/{uid}/…` folder, only PDF/DOC/DOCX, only under 5 MB. Older candidates
whose CV is still a base64 `data:` URL keep working — the view/download code handles
both. **Until Blaze is enabled and Storage rules are deployed, CV uploads will fail**
(the form shows a red "couldn't upload" message).

**Check it worked** — this should return real data BEFORE, and a `403 / PERMISSION_DENIED` AFTER:

```bash
curl "https://firestore.googleapis.com/v1/projects/hyre-127ed/databases/(default)/documents/candidates?key=YOUR_API_KEY"
```

What the locked rules do, in short:
- You must be **signed in** to read or write anything.
- **Profiles**: you can only write your own, and you can **never change your own
  role** — so nobody can promote themselves to staff. Staff roles are provisioned
  by `scripts/provision-staff.mjs`.
- **Positions**: anyone signed in can read; only HR / Management can create or edit.
- **Candidates**:
  - *Read* — staff see everyone; an applicant sees **only their own** rows (by
    user id or their verified email). No more "every applicant can pull all CVs".
  - *Create* — staff add anyone; an applicant can only create **their own**
    application, only into the **Applied** stage (no self-promotion to Hired,
    no forged reviews).
  - *Update* — staff only, and a stage move is allowed **only for the role that
    owns that stage** (HR screens, Interviewer interviews, Management decides).
    The audit trail (`history[]`) is **append-only** — entries can't be deleted
    or truncated, so a rejection can't be quietly erased.
  - *Delete* — nobody (rejected candidates stay in the talent pool).

**Residual gaps (honest):** `history[]` is protected against deletion/truncation
but a staff member could still edit an existing entry's *contents* in place (rules
can't diff array elements cheaply). `comments[]` is staff-mutable by design (so a
reviewer can delete their own note before a move); the client restricts this to
your own comment, but the rule can't prove authorship. These are acceptable for
the current scope but are not "tamper-proof".

---

## What's already in place (no action needed)

**Security headers + Content-Security-Policy** — set in [firebase.json](firebase.json),
applied automatically when you deploy hosting (`firebase deploy --only hosting`):
- `Content-Security-Policy` — the browser will only load scripts/styles/fonts/images
  from us and the Firebase/Google endpoints we actually use. Blocks most injected content.
- `X-Frame-Options: DENY` + `frame-ancestors 'none'` — nobody can iframe the app (clickjacking).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security` — standard hardening.

**Fixed a real XSS hole in the CV viewer** — [src/lib/file.js](src/lib/file.js) used
to build the preview window with `document.write` and a string-glued data URL, so a
crafted "CV" could have run script in our origin. Now: the file's *actual* type is
checked on upload (a renamed `.html` is rejected), only PDF/Word/image data URLs are
ever opened or downloaded, and the preview iframe is built through the DOM so the URL
is never parsed as HTML.

**Route protection** — every app page sits behind `RequireAuth` (must be logged in)
and `RequireRole` (must have the right role); candidates can't reach staff pages and
vice-versa. Signing out clears the session.

**Input caps** — free-text staff inputs (comments, move reasons) are length-limited,
and React escapes everything it renders, so stored text can't execute as markup.

**Dependencies** — ran `npm audit` and applied the safe fixes.

---

## Known risks we have NOT fully closed (be honest about these)

1. **A signed-in candidate can still read the whole candidates collection.**
   The rules require *authentication*, which kills anonymous access — the critical
   fix. But the app subscribes to the entire `candidates` collection for everyone,
   so a logged-in applicant could, in theory, read other applicants' rows via the
   SDK (the UI never shows them). Properly fixing this means changing the candidate's
   data listener to query only their own rows (`where("submittedByUid", "==", uid)`)
   so the rules can then forbid a candidate reading anyone else. That's a client
   change, not a rules change — noted for the next sprint.

2. **CVs are stored as base64 inside Firestore documents.** It keeps us on the free
   plan, but it means every client that reads the collection downloads everyone's CV
   data. The clean fix is Firebase Storage (needs the paid Blaze plan) with per-file
   access rules.

3. **Demo accounts use a weak shared password (`hyre1234`).** Fine for a viva demo,
   but before anything real: remove the demo logins, force strong passwords, and turn
   on email verification in Firebase Auth.

4. **Two dependency advisories remain, both low-risk for us:**
   - `esbuild` — only affects the local **dev server**, never the deployed build.
   - `react-router-dom` — we're on the latest 6.x (6.30.4); the only "fix" is a
     breaking v7 upgrade. The flagged issues are an SSR bug (we don't use SSR) and an
     open-redirect via backslash in links (we only navigate to fixed internal paths),
     so neither is exploitable in how we use it. Upgrade to v7 when there's time to test it.

---

*Last updated after loading the ~700-candidate dataset and the first security pass.*
