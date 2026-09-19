import { collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch, serverTimestamp } from "firebase/firestore";
import { positionIdFor, positionCode, hiredPositionSnapshot, removePositionTree } from "./positionLifecycle.js";

export async function allocatePosition(db, data) {
  const code = positionCode(data.title);
  const counterRef = doc(db, "positionSequences", code);
  for (let attempt = 0; attempt < 5; attempt++) {
    let observed;
    try {
      return await runTransaction(db, async (tx) => {
        const counter = await tx.get(counterRef);
        observed = counter.exists() ? counter.data().next : 0;
        const sequence = observed + 1;
        const posId = positionIdFor(sequence, code);
        const posRef = doc(db, "positions", posId);
        const archiveRef = doc(db, "positionArchive", posId);
        const archive = await tx.get(archiveRef);
        if ((await tx.get(posRef)).exists()) throw new Error("Position identity already exists; counter needs repair.");
        if (archive.exists()) throw new Error("Position identity was previously reserved; counter needs repair.");
        const saved = { ...data, identityCode: code, identitySequence: sequence };
        tx.set(counterRef, { next: sequence });
        tx.set(posRef, saved);
        tx.set(archiveRef, { ...saved, recordState: "Active", reservedAt: serverTimestamp() });
        return { id: posId, ...saved, createdAt: Date.now() };
      });
    } catch (error) {
      // Rules can reject a stale counter claim before the transaction reports
      // contention. Retry only when another creator actually advanced it.
      if (error.code !== "permission-denied" || observed === undefined || attempt === 4) throw error;
      const current = await getDoc(counterRef);
      if (!current.exists() || current.data().next <= observed) throw error;
    }
  }
}

export async function getPositionDeletionSummary(db, positionId) {
  const snapshot = await getDocs(query(collection(db, "applications"), where("positionId", "==", positionId)));
  return { applications: snapshot.size };
}

async function commitChunks(db, items, apply) {
  for (let start = 0; start < items.length; start += 400) {
    const batch = writeBatch(db);
    items.slice(start, start + 400).forEach(item => apply(batch, item));
    await batch.commit();
  }
}

export async function removePersistedPosition(db, positionId) {
  const matching = async (name) => (await getDocs(query(collection(db, name), where("positionId", "==", positionId)))).docs;
  await removePositionTree({
    lock: () => runTransaction(db, async tx => {
      const ref = doc(db, "positions", positionId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) return null;
      if (!snapshot.data().deleting) tx.update(ref, { deleting: true, status: "Closed" });
      return snapshot.data();
    }),
    preserveEmployees: async (_, position) => {
      await commitChunks(db, await matching("employees"), (batch, employee) => {
        const data = employee.data();
        batch.update(employee.ref, {
          hiredPosition: data.hiredPosition || { ...hiredPositionSnapshot(position), title: data.employeeRole || position.title, department: data.employeeDept || position.department },
          employeeRole: data.employeeRole || position.title,
          employeeDept: data.employeeDept || position.department,
        });
      });
    },
    removeChildren: async name => {
      await commitChunks(db, await matching(name), (batch, child) => batch.delete(child.ref));
    },
    removePosition: () => runTransaction(db, async tx => {
      const ref = doc(db, "positions", positionId);
      const position = await tx.get(ref);
      if (!position.exists()) return;
      // Persist the complete final position document, not only a used-ID marker.
      tx.set(doc(db, "positionArchive", positionId), {
        ...position.data(), recordState: "Deleted", deletedAt: serverTimestamp(),
      });
      tx.delete(ref);
    }),
  }, positionId);
}
