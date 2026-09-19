// Read-only: never changes Firestore. Run from the repository root.
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const collections = await db.listCollections();
const data = new Map(await Promise.all(collections.map(async (c) => [c.id, (await c.get()).docs.map(d => ({ ...d.data(), id: d.id }))])));
const positions = new Set((data.get("positions") || []).map(x => x.id));
const applications = new Set((data.get("applications") || []).map(x => x.id));
const report = { auditedAt: new Date().toISOString(), collections: [...data.keys()], missingPositionReferences: {}, scoresWithoutApplication: [] };
for (const [name, rows] of data) {
  const missing = rows.flatMap(r => ["positionId", "fromPositionId"].filter(f => r[f] && !positions.has(r[f])).map(field => ({ id: r.id, field, positionId: r[field], stage: r.stage || null, employeeRole: r.employeeRole || null })));
  if (missing.length) report.missingPositionReferences[name] = missing;
}
report.scoresWithoutApplication = (data.get("applicationScores") || []).filter(s => !applications.has(s.id)).map(s => ({ id: s.id, positionId: s.positionId }));
writeFileSync("position-orphan-audit.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ auditedAt: report.auditedAt, collections: report.collections, missingPositionReferences: Object.fromEntries(Object.entries(report.missingPositionReferences).map(([name, rows]) => [name, { count: rows.length, byPosition: rows.reduce((a, r) => ({ ...a, [r.positionId]: (a[r.positionId] || 0) + 1 }), {}) }])), scoresWithoutApplication: report.scoresWithoutApplication }, null, 2));
