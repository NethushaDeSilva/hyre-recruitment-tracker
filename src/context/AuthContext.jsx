// Auth with email + password + editable user profile.
// When Firebase is configured this uses REAL Firebase Auth and stores each user's
// profile (display name, photo, avatar colour, role) in a Firestore users/{uid}
// document. Falls back to demo/in-memory if keys are absent.
import { createContext, useContext, useEffect, useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, updateProfile as updateAuthProfile, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "@/firebase/config";
import { syncAuth, ensureUserId } from "@/data/store";
import { ACCOUNTS, DEMO_PASSWORD, roleForEmail, cleanTitle } from "@/context/auth-config";

// This file exports ONLY the AuthProvider component and the useAuth hook — plain
// constants (ROLE_USERS, DEMO_PASSWORD, roleForEmail, …) live in ./auth-config so
// React Fast Refresh stays happy and the context module is never duplicated.

// --- "Remember me" session + inactivity timeout ---------------------------
// Firebase already keeps the login in localStorage, so a signed-in user stays
// signed in across reloads and browser restarts (no re-login, no home/login
// detour — the routes forward them straight into the app). On top of that we
// enforce an INACTIVITY window: if the person doesn't use the app for a week,
// their next visit signs them out and they must log in again. We track the last
// time they were active in localStorage and check the gap on load + periodically.
const INACTIVITY_LIMIT_MS = 7 * 24 * 60 * 60 * 1000; // one week
const LAST_ACTIVE_KEY = "hyre:lastActiveAt";
const REMEMBER_KEY = "hyre:rememberMe";

// "Remember me" = HOW LONG the login is kept:
//   ON  → browserLocalPersistence   → stays signed in after the browser is closed
//         (subject to the one-week inactivity timeout above).
//   OFF → browserSessionPersistence → signed out as soon as the browser is closed.
// Must be set BEFORE signing in. Applies to all four user types.
const applyPersistence = async (remember) => {
  try { localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch {}
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.error("persistence:", e);
  }
};
const markActive = () => { try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch {} };
const clearActive = () => { try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch {} };
const sessionExpired = () => {
  try {
    const t = Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
    return t > 0 && Date.now() - t > INACTIVITY_LIMIT_MS;
  } catch { return false; }
};

function friendlySignupError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with that email already exists — try signing in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    case "auth/weak-password":
      return "Please choose a password of at least 6 characters.";
    default:
      return "Could not create your account. Please try again.";
  }
}

// The custom /verify-email route (VerifyEmail.jsx) handles the link in-app —
// consistent with the rest of Hyre never relying on Firebase's default hosted
// action page — so it gives real control over expired/invalid copy.
const verifyEmailActionSettings = () => ({
  url: `${window.location.origin}/verify-email`,
  handleCodeInApp: true,
});

function friendlyError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts — please wait a moment and try again.";
    default:
      return "Invalid email or password.";
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Signed in but idle for over a week → sign out, force a fresh login.
      if (sessionExpired()) {
        clearActive();
        try { await signOut(auth); } catch {}
        setUser(null);
        setLoading(false);
        return;
      }
      markActive(); // a live session — refresh the activity clock
      const base = roleForEmail(fbUser.email);
      let profile = null;
      try {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          profile = snap.data();
        } else {
          // No profile doc — resolve the identity in-memory, do NOT write one.
          //  • Candidates deliberately have NO users/{uid} doc: they belong in the
          //    `candidates` collection (once they apply), not `users`, which is for
          //    STAFF only. The security rules let a candidate read/apply off their
          //    uid + email, so no role doc is needed. Their chosen name rides on the
          //    Firebase Auth profile (set at registration) and on their application.
          //  • Staff docs are provisioned out-of-band (scripts / console) and must
          //    never be self-minted — otherwise anyone could sign in and write
          //    themselves a staff role. A missing staff doc just means limited
          //    access (the DB denies staff writes) until it is provisioned.
          //
          // role is ALWAYS "Candidate" here, never guessed from the email address
          // (base.role). roleForEmail()'s domain-pattern matching used to decide
          // this, which meant self-registering with an @hyre.com-shaped address
          // (allowed — signup is Candidate-only, but nothing stops the email
          // string itself) got a "Management"/"HR"/"Interviewer" client-side role,
          // and RequireRole would render that staff shell — hollow (Firestore
          // rules check the real stored doc, so no actual data leaked) but wrong.
          // No stored doc now means no staff access, never a guessed one. name/
          // title/avatarColor still use roleForEmail — cosmetic-only, not a
          // security boundary, and a reasonable default before a real profile exists.
          profile = { displayName: fbUser.displayName || base.name, title: base.title, role: "Candidate", avatarColor: base.avatarColor, photoURL: fbUser.photoURL || "", email: fbUser.email };
        }
      } catch (e) {
        console.error("profile load:", e);
      }
      // Fails closed to Candidate, never to a guessed staff role — see the no-doc
      // branch above for why base.role must never reach here.
      const resolvedRole = profile?.role || "Candidate";
      const userId = profile?.userId || "";
      setUser({
        uid: fbUser.uid,
        email: fbUser.email,
        emailVerified: !!fbUser.emailVerified,
        role: resolvedRole,
        title: cleanTitle(resolvedRole, profile?.title || base.title),
        name: profile?.displayName || base.name,
        avatarColor: profile?.avatarColor || base.avatarColor,
        photoURL: profile?.photoURL || "",
        // readable USER ID (system-account id, on their users/{uid} doc — staff only)
        userId,
        // staff employee ID (issued out-of-band on their users/{uid} doc)
        employeeId: profile?.employeeId || "",
        employeeDept: profile?.employeeDept || "",
      });
      setLoading(false);

      // Self-heal: a STAFF account with a users doc but no readable User ID yet
      // gets one minted now (existing staff pick theirs up on next sign-in). A
      // candidate has no users doc, so this is a no-op for them.
      if (firebaseReady && resolvedRole !== "Candidate" && !userId) {
        ensureUserId(fbUser.uid)
          .then((id) => {
            if (id) setUser((u) => (u && u.uid === fbUser.uid ? { ...u, userId: id } : u));
          })
          .catch(() => {});
      }
    });
    return unsub;
  }, []);

  // Point the data store at the current user so it subscribes with the right
  // scope (staff → all candidates; applicant → only their own rows).
  useEffect(() => {
    syncAuth(user);
  }, [user]);

  // While signed in, keep the activity clock fresh on real interaction, and poll
  // so a tab left open past the inactivity window still gets signed out.
  useEffect(() => {
    if (!firebaseReady || !user) return;
    markActive();
    let last = Date.now();
    const bump = () => {
      const now = Date.now();
      if (now - last > 30000) { last = now; markActive(); } // throttle writes to ~30s
    };
    const events = ["pointerdown", "keydown", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, bump));
    const iv = setInterval(async () => {
      if (sessionExpired()) {
        clearActive();
        try { await signOut(auth); } catch {}
        setUser(null);
      }
    }, 60000); // check every minute
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, [user?.uid]);

  const login = async (email, password, remember = true) => {
    if (firebaseReady) {
      try {
        await applyPersistence(remember); // remember me → keep session past browser close
        await signInWithEmailAndPassword(auth, String(email).trim(), password);
        markActive(); // start the inactivity clock at login
        return { ok: true };
      } catch (e) {
        return { ok: false, error: friendlyError(e.code) };
      }
    }
    const acc = ACCOUNTS.find((a) => a.email === String(email).trim().toLowerCase());
    if (!acc || password !== DEMO_PASSWORD) return { ok: false, error: "Invalid email or password." };
    setUser({ ...acc.user, email: acc.email });
    return { ok: true };
  };

  // Candidate self-registration. Creates the Firebase Auth user and stores the
  // chosen name on the AUTH profile only — NOT in Firestore. A candidate never
  // gets a users/{uid} doc; they exist in the `candidates` collection once they
  // apply. onAuthStateChanged then picks up the session (role defaults to
  // Candidate for any non-staff email).
  const register = async ({ name, email, password, remember = true }) => {
    const displayName = (name || "").trim();
    if (firebaseReady) {
      try {
        await applyPersistence(remember);
        const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
        if (displayName) await updateAuthProfile(cred.user, { displayName });
        markActive();
        // Layer 2's real proof. The account exists regardless of whether this
        // send succeeds (10.1: never a silent drop) — a failure is reported
        // back so the caller can show a retryable banner, not swallowed here.
        let verificationEmailSent = true;
        try {
          await sendEmailVerification(cred.user, verifyEmailActionSettings());
        } catch (e) {
          console.error("sendEmailVerification (register):", e);
          verificationEmailSent = false;
        }
        return { ok: true, verificationEmailSent };
      } catch (e) {
        return { ok: false, error: friendlySignupError(e.code) };
      }
    }
    // demo mode
    setUser({ role: "Candidate", name: displayName || email, title: "Applicant", avatarColor: "#2563EB", email: String(email).trim() });
    return { ok: true, verificationEmailSent: true };
  };

  // Resend the verification link to whoever is currently signed in — used by
  // Login's post-register banner and Profile's verify-email banner.
  const resendVerificationEmail = async () => {
    if (!firebaseReady || !auth.currentUser) return { ok: false, error: "Not signed in." };
    try {
      await sendEmailVerification(auth.currentUser, verifyEmailActionSettings());
      return { ok: true };
    } catch (e) {
      console.error("resendVerificationEmail:", e);
      if (e.code === "auth/too-many-requests") return { ok: false, error: "Too many attempts — please wait a moment and try again." };
      return { ok: false, error: "Could not send the verification email. Please try again." };
    }
  };

  // Pull the latest emailVerified claim from Firebase (the SDK's cached user
  // object doesn't update on its own when the link is clicked in another tab)
  // and force a fresh ID token so Firestore rules see the current claim too —
  // without this, a just-verified candidate's application could still be
  // rejected by the applications-create rule on a stale token. Never throws;
  // a failure here just means "we don't know yet", not "blocked" — the caller
  // (ApplyModal, Profile) must never let this stall a real user.
  const refreshEmailVerified = async () => {
    if (!firebaseReady || !auth.currentUser) return false;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      console.error("refreshEmailVerified:", e);
    }
    const verified = !!auth.currentUser?.emailVerified;
    setUser((u) => (u ? { ...u, emailVerified: verified } : u));
    return verified;
  };

  // Email the signed-in user a password-reset link.
  const sendPasswordReset = async () => {
    if (!firebaseReady) return { ok: false, error: "Password reset isn't available in demo mode." };
    if (!user?.email) return { ok: false, error: "No email is associated with this account." };
    try {
      await sendPasswordResetEmail(auth, user.email);
      return { ok: true };
    } catch (e) {
      console.error("password reset:", e);
      return { ok: false, error: "Could not send the reset email. Please try again." };
    }
  };

  // "Forgot password?" on the Login page — for someone who ISN'T signed in (that's
  // the whole point: they're locked out). Unlike sendPasswordReset above this takes
  // an arbitrary email and never requires `user`. Mirrors friendlyError()'s existing
  // posture on login (never reveal whether an email is registered): a made-up email
  // reports the same success as a real one, so this can't be used to probe accounts.
  const forgotPassword = async (email) => {
    const clean = String(email || "").trim();
    if (!clean) return { ok: false, error: "Enter your email first." };
    if (!firebaseReady) return { ok: false, error: "Password reset isn't available in demo mode." };
    try {
      await sendPasswordResetEmail(auth, clean);
      return { ok: true };
    } catch (e) {
      if (e.code === "auth/invalid-email") return { ok: false, error: "That doesn't look like a valid email." };
      if (e.code === "auth/too-many-requests") return { ok: false, error: "Too many attempts — please wait a moment and try again." };
      // Any other failure (including auth/user-not-found) still reports success.
      return { ok: true };
    }
  };

  const logout = async () => {
    clearActive();
    if (firebaseReady) {
      try {
        await signOut(auth);
      } catch {}
    }
    setUser(null);
  };

  // Update the signed-in user's profile (name / avatar colour / photo).
  // STAFF profiles persist to their users/{uid} doc. CANDIDATES have no users
  // doc by design, so their name/photo persist on the Firebase Auth profile
  // instead — keeping the `users` collection staff-only.
  const updateProfile = async (updates) => {
    if (!user) return;
    const next = { ...user, ...updates };
    setUser(next);
    if (!firebaseReady || !user.uid) return;
    try {
      if (user.role === "Candidate") {
        if (auth.currentUser) await updateAuthProfile(auth.currentUser, { displayName: next.name, photoURL: next.photoURL || "" });
      } else {
        await setDoc(
          doc(db, "users", user.uid),
          { displayName: next.name, avatarColor: next.avatarColor, photoURL: next.photoURL, title: next.title, role: next.role, email: next.email },
          { merge: true }
        );
      }
    } catch (e) {
      console.error("profile save:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateProfile, sendPasswordReset, forgotPassword, resendVerificationEmail, refreshEmailVerified }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
