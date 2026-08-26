// Login — split-screen: navy brand panel + email/password form.
// Two modes: staff/candidate sign-in, and candidate self-registration ("Apply").
// The account you sign in with determines your role; new sign-ups are Candidates.
import { useState, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Check, AlertCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { DEMO_LOGINS, DEMO_PASSWORD } from "@/context/auth-config";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import Logo from "@/components/Logo";

const BULLETS = [
  "Enforced interview process — no skipped steps",
  "Scored, comparable feedback at every stage",
  "Live oversight and one-click reports",
];

export default function Login() {
  const { user, loading, login, register, forgotPassword } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  // ?mode=register (from "Create a candidate account") opens the sign-up form directly
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "signin"); // "signin" | "register" | "reset"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true); // "Remember me" — default on
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false); // waiting for auth to complete
  // "Forgot password?" — a separate mini-flow, not signed in yet.
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState(null); // { ok, text }

  const isRegister = mode === "register";
  const isReset = mode === "reset";

  // Navigate only once the user is actually authenticated — auth state is set
  // asynchronously (Firebase), so redirecting immediately after login() raced the
  // route guard and bounced back to /login (the "log in twice" bug).
  useEffect(() => {
    if (pending && user) nav("/app", { replace: true });
  }, [pending, user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = isRegister
      ? await register({ name, email, password, remember })
      : await login(email, password, remember);
    if (res.ok) {
      setPending(true); // stay on "Signing in…" until the effect above redirects
    } else {
      setBusy(false);
      setError(res.error);
      // Branded, system popup (not a browser default) for the failure.
      toast.error(res.error, { title: isRegister ? "Couldn't create account" : "Sign-in failed" });
    }
  };

  const fillDemo = (demoEmail) => {
    setMode("signin");
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError("");
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setPassword("");
    setResetMsg(null);
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setResetBusy(true);
    setResetMsg(null);
    const res = await forgotPassword(resetEmail);
    setResetBusy(false);
    setResetMsg(
      res.ok
        ? { ok: true, text: `If an account exists for ${resetEmail.trim()}, we've emailed a link to reset the password.` }
        : { ok: false, text: res.error }
    );
  };

  // Already signed in (session remembered, or just authenticated) → into the app.
  if (loading) return <div className="grid min-h-screen place-items-center bg-card text-sm text-muted-foreground">Loading…</div>;
  if (user) return <Navigate to="/app" replace />;

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div
        className="relative hidden w-[46%] flex-col justify-between p-16 text-white lg:flex"
        style={{ backgroundImage: "linear-gradient(150deg,#1c1c1c,#000000)" }}
      >
        <Link to="/" aria-label="Back to homepage" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <Logo size={44} />
          <span className="text-2xl font-extrabold tracking-tight">Hyre</span>
        </Link>
        <div className="space-y-5">
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight">
            Hiring, in one
            <br />
            clear view.
          </h1>
          <p className="max-w-md leading-relaxed text-white/70">
            The recruitment tracker that keeps every candidate, every interview stage, and every decision in a single, enforced process.
          </p>
          <ul className="space-y-3 pt-2">
            {BULLETS.map((t) => (
              <li key={t} className="flex items-center gap-3 text-white/90">
                <span className="h-2 w-2 rounded-full bg-gold" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-white/40">Recruitment, refined.</div>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col bg-card p-6 sm:p-8">
        {/* Mobile-only brand — the left panel (which carries the home link) is
            hidden below lg, so give phone users a logo that goes back home. */}
        <Link to="/" aria-label="Back to homepage" className="mb-8 flex items-center gap-2.5 transition-opacity hover:opacity-80 lg:hidden">
          <Logo size={36} />
          <span className="text-xl font-extrabold tracking-tight text-foreground">Hyre</span>
        </Link>

        <div className="flex flex-1 items-center justify-center">
        {isReset ? (
        <form onSubmit={submitReset} className="w-full max-w-[400px] space-y-6">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={14} /> Back to sign in
            </button>
            <div className="text-xs font-bold tracking-[0.18em] text-gold">RESET PASSWORD</div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Forgot your password?</h2>
            <p className="text-muted-foreground">Enter your email and we’ll send you a link to reset it.</p>
          </div>

          <Field label="Email">
            <Input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoFocus
            />
          </Field>

          {resetMsg && (
            <p className={`flex items-start gap-1.5 text-sm font-medium ${resetMsg.ok ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
              {resetMsg.ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
              <span>{resetMsg.text}</span>
            </p>
          )}

          <Button type="submit" disabled={resetBusy} className="w-full py-3.5 text-base">
            {resetBusy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        ) : (
        <form onSubmit={submit} className="w-full max-w-[400px] space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-bold tracking-[0.18em] text-gold">
              {isRegister ? "JOIN HYRE" : "WELCOME BACK"}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              {isRegister ? "Create your account" : "Sign in to Hyre"}
            </h2>
            <p className="text-muted-foreground">
              {isRegister
                ? "Register as a candidate to apply for open roles."
                : "Enter your email and password to continue."}
            </p>
          </div>

          <div className="space-y-4">
            {isRegister && (
              <Field label="Full name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Amara Jayasuriya"
                  autoComplete="name"
                  autoFocus
                />
              </Field>
            )}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
                autoFocus={!isRegister}
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? "At least 6 characters" : "••••••••"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {!isRegister && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="text-sm font-medium text-[#DC2626]">{error}</p>}
          </div>

          {/* Remember me — keep the session after the browser is closed (all roles) */}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>Remember me on this device</span>
            <span className="text-xs text-muted-foreground">— stay signed in</span>
          </label>

          <Button type="submit" disabled={busy} className="w-full py-3.5 text-base">
            {busy ? (isRegister ? "Creating account…" : "Signing in…") : isRegister ? "Create account & apply" : "Sign in"}
          </Button>

          {/* mode switch */}
          <p className="text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-primary hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>
                New candidate?{" "}
                <button type="button" onClick={() => switchMode("register")} className="font-semibold text-primary hover:underline">
                  Create an account
                </button>
              </>
            )}
          </p>

          {/* Demo accounts — remove for the final build. Click to fill the form. */}
          {mode === "signin" && (
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs font-semibold text-muted-foreground">
                Demo accounts · password <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEMO_LOGINS.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => fillDemo(d.email)}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    title={`Fill ${d.title}`}
                  >
                    {d.role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        )}
        </div>
      </div>
    </div>
  );
}
