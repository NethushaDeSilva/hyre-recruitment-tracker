import { auth } from "@/firebase/config";

// Only scoring uses this helper. Candidate validation/parsing deliberately do not.
export async function scoringHeaders() {
  if (!auth?.currentUser) {
    const error = new Error("Sign in with a staff account to score applications.");
    error.fatal = true;
    throw error;
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
}
