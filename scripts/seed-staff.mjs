// RESET + SEED the staff, using the Firebase ADMIN SDK (bypasses the locked rules).
//
// This gives a CLEAN slate: it DELETES the old hand-made staff accounts (the ones
// that carried "Director" titles etc.) and creates a fresh set of PER_ROLE people
// per role with sensible, interview-appropriate titles — NO directors / VPs /
// C-level (those don't interview candidates). Both the Firebase Auth login and the
// Firestore users/{uid} role doc are written, so they show in the assignee picker.
//
//   HR:           first.last@hyre.com
//   Interviewer:  first.last.interviewer@hyre.com
//   Management:   first.last.management@hyre.com   (titles: Manager / Supervisor / …)
//
// PRESERVED: the @hyre.app demo login chips (hr@ / interviewer@ / management@) —
// the login page uses them; their titles are tidied (no "Director").
//
// SETUP:  1) Firebase Console → Project settings → Service accounts → Generate new
//            private key → save as  serviceAccountKey.json  in the project root.
//         2) npm i -D firebase-admin
// RUN:    node scripts/seed-staff.mjs
// Idempotent: re-running updates the 60 in place and re-removes any stragglers.
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// People per role — trimmed to a realistic, lean shape (per the team's decision):
// a small HR/recruiting desk, the widest pool of interviewers (the engineers who
// run the technical rounds), and a moderate set of managers for the final round.
// Re-running deletes the surplus accounts (from any earlier larger seed) so the
// assignee picker and the whole system show exactly these counts.
const PER_ROLE = { HR: 5, Interviewer: 15, Management: 10 };
const DOMAIN = "hyre.com";    // real staff
const DEMO_DOMAIN = "hyre.app"; // login chips — never deleted
// ---------------------------------------------------------------------------

const FIRST = [
  "Amara", "Nimal", "Priya", "Rehan", "Dilani", "Sunil", "Ishara", "Kavya", "Tharindu", "Sanduni",
  "Ruwan", "Nadeesha", "Chamara", "Hasini", "Dinesh", "Menaka", "Lahiru", "Oshadi", "Kasun", "Piyumi",
  "Gayan", "Shalini", "Buddhika", "Nethmi", "Asela", "Dulani", "Roshan", "Iresha", "Malith", "Sewwandi",
  "Charith", "Anjana", "Vishwa", "Thilini", "Suranga", "Madhavi", "Isuru", "Harshani", "Chathura", "Yasodha",
];
const LAST = [
  "Perera", "Fernando", "Silva", "Jayasuriya", "Bandara", "Wickramasinghe", "Gunawardena", "Rajapaksa", "Dissanayake", "Herath",
  "Senanayake", "Wijesinghe", "Karunaratne", "Ekanayake", "Weerasinghe", "Amarasinghe", "Kumara", "Mendis", "Peiris", "Rathnayake",
  "Abeywardena", "Samaraweera", "Liyanage", "Gunasekara", "Wijeratne", "Jayawardena", "Seneviratne", "Ranasinghe", "Athukorala", "Wickrama",
];

// Real, formal IT-company job titles (Hyre is an IT firm). 20 distinct titles per
// role so every one of the 20 people gets their own.
//  • HR          — the recruiting / talent-acquisition function.
//  • Interviewer — actual IT SPECIALISTS who run the technical rounds: developers,
//                  designers, cyber, data, cloud, etc. NOT "interviewer" titles —
//                  they're engineers who happen to interview.
//  • Management  — a VARIED mix of IT and general managers (different people, not
//                  all engineering managers). Manager/lead level only — NEVER
//                  directors / VPs / C-level (they don't run interviews here).
const TITLES = {
  // HR is uniform: every HR person is an "HR Recruiter" (the HR-screening owners) —
  // no varied recruiting-title variants. Interviewer & Management stay varied below.
  HR: ["HR Recruiter"],
  Interviewer: ["Frontend Developer", "Backend Developer", "Full Stack Developer", "Web Developer", "Web Designer", "UI/UX Designer", "Mobile App Developer", "Software Engineer", "QA Engineer", "DevOps Engineer", "Cloud Engineer", "Cybersecurity Specialist", "Data Scientist", "Database Administrator", "Systems Engineer", "Network Engineer", "Machine Learning Engineer", "Software Architect", "Site Reliability Engineer", "Security Analyst"],
  Management: ["Engineering Manager", "Senior Engineering Manager", "Technical Program Manager", "Product Manager", "Project Manager", "IT Manager", "Development Manager", "Delivery Manager", "Operations Manager", "Software Development Manager", "QA Manager", "Platform Manager", "Product Owner", "Engineering Team Lead", "Technical Project Manager", "Program Manager", "Infrastructure Manager", "Solutions Manager", "Support Manager", "Release Manager"],
};
const SUFFIX = { HR: "", Interviewer: ".interviewer", Management: ".management" };
const PALETTE = ["#1F3A5F", "#2563EB", "#4F46E5", "#0D9488", "#DB2777", "#D97706", "#7C3AED", "#0EA5E9", "#16A34A", "#E0A422"];
const ROLES = ["HR", "Interviewer", "Management"];

// --- build the 60 target people (deterministic, so re-runs hit the same emails) ---
const used = new Set();
const people = [];
let g = 0;
for (let r = 0; r < ROLES.length; r++) {
  const role = ROLES[r];
  for (let i = 0; i < PER_ROLE[role]; i++) {
    const first = FIRST[(i + r * 7) % FIRST.length];
    const last = LAST[(i * 13 + r * 5) % LAST.length];
    const slug = `${first}.${last}`.toLowerCase();
    let local = `${slug}${SUFFIX[role]}`;
    let n = 2;
    while (used.has(local)) local = `${slug}${n++}${SUFFIX[role]}`;
    used.add(local);
    people.push({
      role,
      displayName: `${first} ${last}`,
      email: `${local}@${DOMAIN}`,
      title: TITLES[role][i % TITLES[role].length],
      avatarColor: PALETTE[g % PALETTE.length],
      password: `${first}-Hyre-${1000 + g}`,
    });
    g++;
  }
}
const targetEmails = new Set(people.map((p) => p.email));

// --- init Admin SDK ---
let serviceAccount;
try {
  const keyPath = process.env.SERVICE_ACCOUNT || new URL("../serviceAccountKey.json", import.meta.url);
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (e) {
  console.error("✗ Could not read serviceAccountKey.json.");
  console.error("  Firebase Console → Project settings → Service accounts → Generate new private key,");
  console.error("  save it as serviceAccountKey.json in the project root, then run again.");
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

// --- 1) CLEANUP: delete old staff accounts that aren't part of the fresh 60 and
//        aren't the @hyre.app demo chips (removes priya@hyre.com, the old
//        "Director" management accounts, and any earlier stragglers). ---
let removed = 0;
const snap = await db.collection("users").get();
for (const d of snap.docs) {
  const x = d.data();
  if (!ROLES.includes(x.role)) continue;                 // leave candidates alone
  const email = x.email || "";
  if (email.endsWith(`@${DEMO_DOMAIN}`)) continue;        // keep demo login chips
  if (targetEmails.has(email)) continue;                 // keep the fresh 60 (idempotent)
  try {
    try { await auth.deleteUser(d.id); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    await d.ref.delete();
    console.log(`🗑  removed ${email || d.id} (${x.role})`);
    removed++;
  } catch (e) {
    console.error(`✗ delete ${email}: ${e.code || e.message}`);
  }
}

// --- 2) CREATE / UPDATE the fresh 60 ---
let ok = 0;
const rows = [["name", "role", "title", "email", "password"]];
for (const p of people) {
  try {
    let uid;
    try {
      const u = await auth.createUser({ email: p.email, password: p.password, displayName: p.displayName });
      uid = u.uid;
      process.stdout.write(`＋ ${p.email}  `);
    } catch (e) {
      if (e.code === "auth/email-already-exists") {
        const u = await auth.getUserByEmail(p.email);
        uid = u.uid;
        await auth.updateUser(uid, { displayName: p.displayName });
        process.stdout.write(`↻ ${p.email}  `);
      } else throw e;
    }
    await db.doc(`users/${uid}`).set(
      { displayName: p.displayName, title: p.title, role: p.role, avatarColor: p.avatarColor, photoURL: "", email: p.email },
      { merge: true }
    );
    console.log(`→ ${p.role} · ${p.title}`);
    rows.push([p.displayName, p.role, p.title, p.email, p.password]);
    ok++;
  } catch (e) {
    console.error(`✗ ${p.email}: ${e.code || e.message}`);
  }
}

// --- 3) tidy the demo login chips' titles (no "Director") ---
const DEMO_FIX = [
  { email: `hr@${DEMO_DOMAIN}`, title: "HR Recruiter" },
  { email: `interviewer@${DEMO_DOMAIN}`, title: "Full Stack Developer" },
  { email: `management@${DEMO_DOMAIN}`, title: "Engineering Manager" },
];
for (const d of DEMO_FIX) {
  try {
    const u = await auth.getUserByEmail(d.email);
    await db.doc(`users/${u.uid}`).set({ title: d.title }, { merge: true });
  } catch { /* chip may not exist — ignore */ }
}

// --- credentials CSV + summary ---
const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
writeFileSync(new URL("../seed-staff-credentials.csv", import.meta.url), csv, "utf8");
const byRole = ROLES.map((r) => `${r}: ${people.filter((p) => p.role === r).length}`).join("  ·  ");
console.log(`\nDone. Removed ${removed} old account(s). Seeded ${ok}/${people.length} staff.  (${byRole})`);
console.log("Logins written to seed-staff-credentials.csv");
process.exit(ok === people.length ? 0 : 1);
