// One-off loader: generate ~700 realistic Sri Lankan candidates (every standard
// CV field filled) and write them to the Firestore `candidates` collection in
// batches. Run once, while Firestore is still open, before locking the rules.
//
//   node scripts/seed-candidates.mjs           → adds 700
//   node scripts/seed-candidates.mjs 500       → adds 500
//
// Reads the public web config from .env.local (same keys the app uses).
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";

// --- read .env.local (VITE_FIREBASE_* keys) ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const TOTAL = Number(process.argv[2]) || 700;

// ---------------------------------------------------------------------------
// Sri Lankan data pools (Sinhalese, Tamil, Muslim, Burgher — realistic mix)
// ---------------------------------------------------------------------------
const FIRST = [
  "Kasun","Nimal","Sunil","Chaminda","Dinesh","Ruwan","Tharindu","Sanjaya","Isuru","Lahiru",
  "Kavinda","Pasan","Nuwan","Sampath","Gayan","Chathura","Buddhika","Roshan","Supun","Malith",
  "Dhanushka","Prasanna","Thilina","Janith","Hasitha","Nirmal","Chamara","Udara","Sachith","Rukshan",
  "Arjun","Karthik","Vignesh","Suresh","Mathan","Prabhu","Kumaran","Thivakar","Ajith","Dilan",
  "Mohamed","Ahamed","Rizwan","Imran","Fazal","Rifky","Shafraz","Nishan","Roshen","Dulaj",
  "Sachini","Nadeesha","Ishara","Dilini","Hasini","Amaya","Sewwandi","Tharushi","Nethmi","Piumi",
  "Kaveesha","Chathurika","Dulani","Iresha","Nipuni","Sanduni","Hansika","Gayathri","Malsha","Rashmi",
  "Upeksha","Thilini","Yasodha","Nimasha","Kumari","Nirosha","Erandi","Ruwani","Dinusha","Shanika",
  "Abarna","Thivya","Kokila","Vaishnavi","Fathima","Aysha","Nusrath","Rifka","Zaara","Hafsa",
];
const LAST = [
  "Perera","Fernando","Silva","Jayawardena","Bandara","Wickramasinghe","Rajapaksa","Dissanayake",
  "Gunawardena","Senanayake","Herath","Ekanayake","Weerasinghe","Karunaratne","Amarasinghe","Rathnayake",
  "Kumara","Wijesinghe","Abeywickrama","Samarasekara","Gunasekara","Jayasuriya","Liyanage","Mendis",
  "Peiris","Athukorala","Pathirana","Wijekoon","Ranasinghe","Fonseka","De Silva","Kodikara",
  "Nadarajah","Sivakumar","Balasubramaniam","Thangavel","Rajaratnam","Selvarajah","Kandasamy",
  "Nazeer","Hameed","Rauf","Marikkar","Cassim","Jayakody","Wijeratne","Seneviratne","Gamage",
];
const CITIES = [
  "Colombo","Kandy","Galle","Jaffna","Negombo","Kurunegala","Anuradhapura","Matara","Ratnapura",
  "Batticaloa","Trincomalee","Gampaha","Kalutara","Nuwara Eliya","Badulla","Dehiwala","Moratuwa",
  "Sri Jayawardenepura Kotte","Maharagama","Panadura","Kegalle","Chilaw","Vavuniya","Puttalam","Ampara",
];
const COMPANIES = [
  "WSO2","IFS","Sysco LABS","Virtusa","MillenniumIT ESP","99x","Dialog Axiata","John Keells Holdings",
  "MAS Holdings","Brandix","Hemas Holdings","Sampath Bank","Commercial Bank","Hatton National Bank",
  "LOLC Holdings","Cargills Ceylon","Softlogic Holdings","CodeGen","Zone24x7","hSenid","Creative Software",
  "Persistent Systems","Pearson Lanka","LSEG Technology","DirectFN","Calcey","Arimac Lanka","Fcode Labs",
  "Rootcode","Axiata Digital Labs","Epic Technology Group","Cambio Software","Bileeta","Freelance",
];
const DOMAINS = ["gmail.com","yahoo.com","outlook.com","hotmail.com"];

// position → { pipeline, roles, category, fields }
const CATEGORIES = {
  frontend: {
    roles: ["Frontend Developer","React Developer","UI Engineer","Senior Frontend Developer","Web Developer","JavaScript Developer"],
    skills: ["React","TypeScript","JavaScript","Redux","Next.js","Tailwind CSS","HTML5","CSS3","REST APIs","Git","Figma","Jest","Vue.js","Angular","SASS","Webpack","Node.js"],
    fields: ["Computer Science","Software Engineering","Information Technology","Information Systems","Computer Engineering"],
  },
  hr: {
    roles: ["HR Executive","HR Associate","People Operations Executive","Recruitment Coordinator","HR Officer","Talent Acquisition Executive"],
    skills: ["Recruitment","Talent Acquisition","Onboarding","Employee Relations","HRIS","Payroll","Performance Management","Training & Development","Sourcing","Interviewing","MS Office","Grievance Handling"],
    fields: ["Human Resource Management","Business Administration","Management","Psychology","Business Management"],
  },
  sales: {
    roles: ["Sales Executive","Account Manager","Sales Manager","Business Development Executive","Regional Sales Lead","Key Account Executive"],
    skills: ["B2B Sales","CRM","Salesforce","Negotiation","Lead Generation","Account Management","Cold Calling","Pipeline Management","Client Relations","Market Research","Forecasting"],
    fields: ["Business Administration","Marketing","Management","Business Management","Economics"],
  },
  qa: {
    roles: ["QA Engineer","Test Engineer","QA Analyst","Automation Engineer","SQA Engineer","Software Quality Engineer"],
    skills: ["Selenium","Test Automation","JIRA","Manual Testing","Postman","Cypress","TestNG","API Testing","Regression Testing","SQL","Bug Tracking","Agile","Playwright"],
    fields: ["Computer Science","Software Engineering","Information Technology","Information Systems"],
  },
  design: {
    roles: ["UI/UX Designer","Product Designer","UX Designer","Visual Designer","Interaction Designer"],
    skills: ["Figma","Adobe XD","Sketch","UI Design","UX Design","Prototyping","Wireframing","User Research","Design Systems","Illustrator","Photoshop","Interaction Design"],
    fields: ["Design","Multimedia","Information Technology","Fine Arts","Human-Computer Interaction"],
  },
};
const DEFAULT_PIPELINE = ["applied","screening","dept","interview","final","hired"];
const JUNIOR_PIPELINE = ["applied","screening","interview","hired"];
const POSITIONS = [
  { id: "pos_1", weight: 0.34, category: "frontend", pipeline: DEFAULT_PIPELINE },
  { id: "pos_2", weight: 0.15, category: "hr",       pipeline: JUNIOR_PIPELINE },
  { id: "pos_3", weight: 0.24, category: "sales",    pipeline: DEFAULT_PIPELINE },
  { id: "pos_4", weight: 0.20, category: "qa",       pipeline: DEFAULT_PIPELINE },
  { id: "pos_5", weight: 0.07, category: "design",   pipeline: JUNIOR_PIPELINE },
];
const QUALIFICATIONS = ["GCE O/L","GCE A/L","Diploma","Higher Diploma","Bachelor's Degree","Postgraduate Diploma","Master's Degree","PhD","Professional Certification"];
const EXPERIENCE = ["No experience","Less than 1 year","1–3 years","3–5 years","5–10 years","10+ years"];
const REJECTION_REASONS = ["Insufficient experience","Qualification mismatch","Salary expectation","Failed interview","Position already filled","Better candidate selected","Not suitable for this role","Other"];
const AVATAR_COLORS = ["#2563EB","#4F46E5","#E0A422","#16A34A","#DC2626","#0EA5E9","#DB2777","#1F3A5F","#64748B"];

// --- random helpers ---
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
function weighted(pairs) { // [[value, weight], ...]
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[0][0];
}
function sampleN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}

const QUAL_W = [["Bachelor's Degree",40],["Diploma",15],["GCE A/L",12],["Higher Diploma",10],["Master's Degree",10],["Professional Certification",7],["GCE O/L",4],["Postgraduate Diploma",2]];
const EXP_W = [["1–3 years",30],["3–5 years",22],["Less than 1 year",18],["5–10 years",15],["No experience",8],["10+ years",7]];
const COVER_TEMPLATES = [
  (r, f, city) => `I'm a ${city}-based professional with a strong background in ${f}. I'd love to bring my ${r.toLowerCase()} experience to Altrium and contribute from day one.`,
  (r, f) => `Having worked as a ${r.toLowerCase()} for a few years, I've built solid hands-on skills in ${f}. I'm keen to keep growing and take on new challenges with your team.`,
  (r) => `I believe my practical experience as a ${r.toLowerCase()} lines up well with what you're looking for. I'm a fast learner, a team player, and genuinely excited about this role.`,
  (r, f) => `My studies in ${f} and my work as a ${r.toLowerCase()} have prepared me to add real value here. I'd welcome the chance to discuss how I can help.`,
  (r) => `I'm applying because I want to work somewhere I can make an impact. My ${r.toLowerCase()} background means I can hit the ground running.`,
];

function pipelineStageFor() {
  // weighted toward Applied — that's the "700 CVs pile up" reality
  return weighted([["applied",60],["screening",13],["dept",4],["interview",8],["interview2",1],["final",3],["hired",3],["rejected",8]]);
}

function makeHistory(pipeline, stage, name, appliedTs) {
  const apply = { type: "apply", from: null, to: "applied", at: appliedTs, by: name, byRole: "" };
  if (stage === "applied") return [apply];
  const hist = [apply];
  let t = appliedTs;
  const step = () => (t += rndInt(1, 6) * 86400000); // 1–6 days between moves
  if (stage === "rejected") {
    // rejected partway through — pick a stage they were at
    const at = rnd(pipeline.slice(0, Math.max(1, pipeline.length - 1)));
    hist.push({ type: "reject", from: at, to: "rejected", at: step(), by: "Priya Fernando", byRole: "HR" });
    return hist;
  }
  const target = pipeline.indexOf(stage);
  for (let i = 1; i <= target; i++) {
    const to = pipeline[i];
    hist.push({ type: to === "hired" ? "hire" : "stage", from: pipeline[i - 1], to, at: step(), by: "Recruitment team", byRole: "HR" });
  }
  return hist;
}

function makeCandidate() {
  const pos = weighted(POSITIONS.map((p) => [p, p.weight]));
  const cat = CATEGORIES[pos.category];
  const first = rnd(FIRST);
  const last = rnd(LAST);
  const name = `${first} ${last}`;
  const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
  const email = `${slug}${rndInt(1, 998)}@${rnd(DOMAINS)}`;
  const city = rnd(CITIES);
  const qualification = weighted(QUAL_W);
  const experience = weighted(EXP_W);
  const fresh = experience === "No experience";
  const role = rnd(cat.roles);
  const skills = sampleN(cat.skills, rndInt(4, 7)).join(", ");
  const phone = `+947${rnd(["0","1","2","4","5","6","7","8"])} ${rndInt(100, 999)} ${rndInt(1000, 9999)}`;
  const appliedTs = Date.now() - rndInt(1, 130) * 86400000 - rndInt(0, 86400000);

  // stage must exist in this position's pipeline (else fall back to applied)
  let stage = pipelineStageFor();
  if (stage !== "rejected" && !pos.pipeline.includes(stage)) stage = "applied";

  const tmpl = rnd(COVER_TEMPLATES);
  const c = {
    name,
    email,
    positionId: pos.id,
    stage,
    appliedRole: role,
    avatarColor: rnd(AVATAR_COLORS),
    appliedAt: new Date(appliedTs),
    phone,
    location: `${city}, Sri Lanka`,
    highestQualification: qualification,
    fieldOfStudy: rnd(cat.fields),
    experience,
    currentRole: fresh ? "" : role,
    currentCompany: fresh ? "" : rnd(COMPANIES),
    skills,
    linkedIn: chance(0.7) ? `https://linkedin.com/in/${slug}-${rndInt(10, 99)}` : "",
    coverNote: chance(0.72) ? tmpl(role, rnd(cat.fields), city) : "",
    cvFileName: "",
    cvDataUrl: "",
    cvSize: 0,
    source: "Self-applied",
    submittedByUid: "",
    history: makeHistory(pos.pipeline, stage, name, appliedTs),
    comments: [],
    rejection: null,
  };
  if (stage === "rejected") {
    c.rejection = { reason: rnd(REJECTION_REASONS), comment: "", stage: "screening", at: appliedTs + 3 * 86400000, by: "Priya Fernando", byRole: "HR" };
  }
  return c;
}

// --- write in batches of 450 ---
async function run() {
  console.log(`Generating ${TOTAL} Sri Lankan candidates for project ${env.VITE_FIREBASE_PROJECT_ID}…`);
  const col = collection(db, "candidates");
  let written = 0;
  while (written < TOTAL) {
    const size = Math.min(450, TOTAL - written);
    const batch = writeBatch(db);
    for (let i = 0; i < size; i++) batch.set(doc(col), makeCandidate());
    await batch.commit();
    written += size;
    console.log(`  …committed ${written}/${TOTAL}`);
  }
  console.log(`Done. Wrote ${written} candidates to Firestore.`);
  process.exit(0);
}
run().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
