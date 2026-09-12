// /verify-email — the custom landing page for Firebase's email-verification
// action link (layer 2). Deliberately NOT Firebase's default hosted action
// page: this app never relies on default browser/Firebase chrome anywhere
// else, and a custom page gives real control over expired/invalid copy
// rather than a generic Firebase error string. Public route — the link may
// be opened in a browser session with no active sign-in (a different device,
// a fresh tab), and applyActionCode() works standalone either way.
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { applyActionCode } from "firebase/auth";
import { CheckCircle2, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { auth, firebaseReady } from "@/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import Logo from "@/components/Logo";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, refreshEmailVerified, resendVerificationEmail } = useAuth();
  const oobCode = params.get("oobCode") || "";
  const [state, setState] = useState("verifying"); // verifying | success | expired | invalid | error
  const [resendMsg, setResendMsg] = useState(null);

  const run = async () => {
    setState("verifying");
    if (!firebaseReady || !oobCode) {
      setState("invalid");
      return;
    }
    try {
      await applyActionCode(auth, oobCode);
      // If this browser is signed in as the account that just verified, pick
      // up the change immediately rather than waiting for the next token
      // refresh — so a candidate who verifies then comes straight back isn't
      // shown a stale "unverified" state.
      if (auth.currentUser) await refreshEmailVerified();
      setState("success");
    } catch (e) {
      if (e.code === "auth/expired-action-code") setState("expired");
      else if (e.code === "auth/invalid-action-code") setState("invalid");
      else setState("error");
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oobCode]);

  const resend = async () => {
    setResendMsg(null);
    const res = await resendVerificationEmail();
    setResendMsg(res.ok ? { ok: true, text: "A new verification link is on its way." } : { ok: false, text: res.error });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-card p-6">
      <div className="w-full max-w-[420px] space-y-6 text-center">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2.5">
          <Logo size={36} />
          <span className="text-xl font-extrabold tracking-tight text-foreground">Hyre</span>
        </Link>

        {state === "verifying" && (
          <div className="space-y-3">
            <Loader2 size={28} className="mx-auto animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Verifying your email…</p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-[#16A34A]" />
            <h1 className="text-xl font-extrabold text-foreground">Email verified</h1>
            <p className="text-sm text-muted-foreground">
              {user ? "You're all set — you can continue into Hyre." : "You're all set. Sign in to continue."}
            </p>
            <Button onClick={() => nav(user ? "/app" : "/login")} className="w-full">
              {user ? "Continue to Hyre" : "Go to sign in"}
            </Button>
          </div>
        )}

        {(state === "expired" || state === "invalid") && (
          <div className="space-y-3">
            <AlertCircle size={32} className="mx-auto text-[#DC2626]" />
            <h1 className="text-xl font-extrabold text-foreground">
              {state === "expired" ? "This link has expired" : "This link isn't valid"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {state === "expired"
                ? "Verification links only last a little while. Request a new one below, or from your Profile page once signed in."
                : "This link has already been used, or the address in it doesn't match a pending request. If you've already verified, you're good to go."}
            </p>
            {user ? (
              <>
                <Button onClick={resend} className="w-full">
                  <RotateCcw size={15} /> Send a new link
                </Button>
                {resendMsg && (
                  <p className={`text-sm font-medium ${resendMsg.ok ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{resendMsg.text}</p>
                )}
              </>
            ) : (
              <Link to="/login" className="inline-block text-sm font-semibold text-primary hover:underline">
                Sign in, then resend from your Profile page
              </Link>
            )}
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3">
            <AlertCircle size={32} className="mx-auto text-[#DC2626]" />
            <h1 className="text-xl font-extrabold text-foreground">We couldn't check this link</h1>
            <p className="text-sm text-muted-foreground">This is on our end, not yours — please try again.</p>
            <Button onClick={run} className="w-full">
              <RotateCcw size={15} /> Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
