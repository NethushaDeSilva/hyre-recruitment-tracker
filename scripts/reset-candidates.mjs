// RESET the candidates collection: DELETE every existing candidate, then seed
// EXACTLY 60 fresh ones — ALL in the "applied" stage, nothing further along.
// Each gets a candidate ID (CAND-0001 … CAND-0060). Uses the Firebase ADMIN SDK
// (bypasses the locked rules, which deny candidate deletes).
//
// ONLY touches the `candidates` collection — the `users` (staff) collection is
// never read or written here.
//
// SETUP:  serviceAccountKey.json in the project root (Console → Project settings →
//         Service accounts → Generate new private key).
// RUN:    node scripts/reset-candidates.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const COUNT = 60;

// --- init admin ---
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8"));
} catch {
  console.error("✗ Could not read serviceAccountKey.json (Console → Project settings → Service accounts → Generate new private key).");
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// --- data pools (realistic Sri Lankan mix) ---
const FIRST = ["Kasun","Nimal","Sunil","Dinesh","Ruwan","Tharindu","Isuru","Lahiru","Kavinda","Nuwan","Gayan","Chathura","Buddhika","Roshan","Supun","Malith","Arjun","Karthik","Vignesh","Suresh","Prabhu","Ajith","Dilan","Mohamed","Rizwan","Imran","Rifky","Nishan","Sachini","Nadeesha","Ishara","Dilini","Hasini","Amaya","Sewwandi","Tharushi","Nethmi","Piumi","Chathurika","Dulani","Iresha","Nipuni","Sanduni","Gayathri","Thilini","Yasodha","Nirosha","Erandi","Fathima","Aysha","Nusrath","Zaara"];
const LAST = ["Perera","Fernando","Silva","Jayawardena","Bandara","Wickramasinghe","Rajapaksa","Dissanayake","Gunawardena","Senanayake","Herath","Ekanayake","Weerasinghe","Karunaratne","Amarasinghe","Rathnayake","Kumara","Wijesinghe","Jayasuriya","Liyanage","Mendis","Peiris","Athukorala","Ranasinghe","De Silva","Nadarajah","Sivakumar","Selvarajah","Nazeer","Marikkar","Wijeratne","Seneviratne","Gamage"];
const CITIES = ["Colombo","Kandy","Galle","Jaffna","Negombo","Kurunegala","Matara","Gampaha","Kalutara","Dehiwala","Moratuwa","Maharagama","Panadura","Kegalle","Batticaloa","Trincomalee"];
const COMPANIES = ["WSO2","IFS","Sysco LABS","Virtusa","99x","Dialog Axiata","MAS Holdings","Sampath Bank","Commercial Bank","LOLC Holdings","CodeGen","Zone24x7","hSenid","Creative Software","LSEG Technology","Calcey","Arimac Lanka","Rootcode","Axiata Digital Labs","Freelance"];
const DOMAINS = ["gmail.com","yahoo.com","outlook.com","hotmail.com"];
const SKILLS = ["React","TypeScript","JavaScript","Node.js","Python","Java","SQL","Git","REST APIs","Docker","AWS","Figma","Agile","Selenium","Test Automation","Communication","Problem Solving","Leadership","CRM","Data Analysis","Recruitment","Project Management","Cloud","CI/CD","MongoDB"];
const FIELDS = ["Computer Science","Software Engineering","Information Technology","Information Systems","Business Administration","Management","Human Resource Management","Marketing","Data Science","Engineering"];
const QUALS = [["Bachelor's Degree",42],["Diploma",16],["GCE A/L",12],["Higher Diploma",10],["Master's Degree",10],["Professional Certification",6],["GCE O/L",4]];
const EXPS = [["1–3 years",30],["3–5 years",22],["Less than 1 year",18],["5–10 years",15],["No experience",8],["10+ years",7]];
const AVATAR = ["#2563EB","#4F46E5","#E0A422","#16A34A","#DC2626","#0EA5E9","#DB2777","#1F3A5F","#64748B"];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const rndInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const weighted = (pairs) => { const t = pairs.reduce((s, [, w]) => s + w, 0); let r = Math.random() * t; for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[0][0]; };
const sampleN = (arr, n) => { const c = [...arr], o = []; for (let i = 0; i < n && c.length; i++) o.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return o; };

async function deleteAllCandidates() {
  let removed = 0;
  // page through the collection, deleting in batches (safe for 700+)
  while (true) {
    const snap = await db.collection("candidates").limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    console.log(`  …deleted ${removed}`);
    if (snap.size < 400) break;
  }
  return removed;
}

async function run() {
  // 1) which positions exist — spread the 60 across them (round-robin).
  const posSnap = await db.collection("positions").get();
  const positions = posSnap.docs.map((d) => ({ id: d.id, title: d.data().title || "Candidate" }));
  if (!positions.length) { console.error("✗ No positions found — open at least one position first."); process.exit(1); }

  // 2) wipe every existing candidate.
  console.log("Deleting all existing candidates…");
  const removed = await deleteAllCandidates();
  console.log(`Removed ${removed} candidate(s).`);

  // 3) create exactly 60, ALL in "applied".
  console.log(`Seeding ${COUNT} candidates (all Applied)…`);
  const col = db.collection("candidates");
  const batch = db.batch();
  for (let i = 0; i < COUNT; i++) {
    const first = rnd(FIRST), last = rnd(LAST);
    const name = `${first} ${last}`;
    const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    const pos = positions[i % positions.length]; // round-robin across positions
    const exp = weighted(EXPS);
    const fresh = exp === "No experience";
    const city = rnd(CITIES);
    const appliedTs = Date.now() - rndInt(1, 60) * 86400000 - rndInt(0, 86400000);
    const candidateId = `CAND-${String(i + 1).padStart(4, "0")}`;
    const data = {
      candidateId,
      name,
      email: `${slug}${rndInt(1, 998)}@${rnd(DOMAINS)}`,
      positionId: pos.id,
      stage: "applied", // ← never anything but applied
      appliedRole: pos.title,
      avatarColor: rnd(AVATAR),
      appliedAt: Timestamp.fromMillis(appliedTs),
      phone: `+947${rnd(["0","1","2","4","5","6","7","8"])} ${rndInt(100, 999)} ${rndInt(1000, 9999)}`,
      location: `${city}, Sri Lanka`,
      highestQualification: weighted(QUALS),
      fieldOfStudy: rnd(FIELDS),
      experience: exp,
      currentRole: fresh ? "" : pos.title,
      currentCompany: fresh ? "" : rnd(COMPANIES),
      skills: sampleN(SKILLS, rndInt(4, 7)).join(", "),
      linkedIn: chance(0.7) ? `https://linkedin.com/in/${slug}-${rndInt(10, 99)}` : "",
      coverNote: "",
      cvFileName: "",
      cvDataUrl: "",
      cvSize: 0,
      source: "Self-applied",
      submittedByUid: "",
      history: [{ type: "apply", from: null, to: "applied", at: appliedTs, by: name, byRole: "" }],
      comments: [],
      rejection: null,
    };
    batch.set(col.doc(), data);
  }
  await batch.commit();
  console.log(`\nDone. Wiped ${removed}, seeded ${COUNT} candidates — ALL in Applied, IDs CAND-0001…CAND-${String(COUNT).padStart(4, "0")}.`);
  process.exit(0);
}
run().catch((e) => { console.error("Reset failed:", e); process.exit(1); });
