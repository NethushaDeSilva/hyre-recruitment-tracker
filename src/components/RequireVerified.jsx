// Gate for STAFF-only routes: an account exists and is signed in, but HR
// functions stay locked until the email-verification link is clicked (layer
// 2, CLAUDE.md). Deliberately never wraps a Candidate route — an application
// is never blocked or hidden for being unverified, only shown an indicator
// (see CandidatesTableRow's "Email unverified" pill).
import { useState } from "react";
import { MailWarning, RotateCcw, RefreshCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";

export default function RequireVerified({ children }) {
  const { user, resendVerificationEmail, refreshEmailVerified } = useAuth();
  const [resendMsg, setResendMsg] = useState(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!user || user.role === ROLES.CANDIDATE || user.emailVerified) return children;

  const resend = async () => {
    setResendBusy(true);
    setResendMsg(null);
    const res = await resendVerificationEmail();
    setResendBusy(false);
    setResendMsg(res.ok ? { ok: true, text: "Verification email sent — check your inbox." } : { ok: false, text: res.error });
  };

  const checkNow = async () => {
    setChecking(true);
    await refreshEmailVerified(); // flips user.emailVerified in context if it's now true, re-rendering this away
    setChecking(false);
  };

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-card">
        <MailWarning size={32} className="mx-auto text-[#E0A422]" />
        <h1 className="text-lg font-extrabold text-foreground">Verify your email to continue</h1>
        <p className="text-sm text-muted-foreground">
          We sent a link to <span className="font-semibold text-foreground">{user.email}</span>. Click it, then come back here —
          HR functions stay locked until your email is verified.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={checkNow} disabled={checking}>
            <RefreshCcw size={15} className={checking ? "animate-spin" : ""} /> {checking ? "Checking…" : "I've verified — refresh"}
          </Button>
          <Button variant="ghost" onClick={resend} disabled={resendBusy}>
            <RotateCcw size={15} /> {resendBusy ? "Sending…" : "Resend email"}
          </Button>
        </div>
        {resendMsg && (
          <p className={`text-sm font-medium ${resendMsg.ok ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{resendMsg.text}</p>
        )}
      </div>
    </div>
  );
}
