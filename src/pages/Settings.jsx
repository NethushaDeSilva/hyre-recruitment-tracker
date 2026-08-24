// Settings — reachable from the account menu (gear icon). Three sections a web
// app usually has: your account, appearance (light/dark), and security.
import { useState } from "react";
import { Link } from "react-router-dom";
import { User, Sun, Moon, Mail, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { currentTheme, applyTheme } from "@/lib/theme";

export default function Settings() {
  const { user, sendPasswordReset } = useAuth();
  const [theme, setTheme] = useState(currentTheme());
  const [sending, setSending] = useState(false);
  const [resetMsg, setResetMsg] = useState(null); // { ok, text }

  const chooseTheme = (t) => setTheme(applyTheme(t));

  const resetPw = async () => {
    setSending(true);
    setResetMsg(null);
    const res = await sendPasswordReset();
    setSending(false);
    setResetMsg(
      res.ok
        ? { ok: true, text: `We've emailed a password-reset link to ${user?.email}.` }
        : { ok: false, text: res.error }
    );
  };

  const themeBtn = (active) =>
    `inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors ${
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border bg-card text-muted-foreground hover:bg-background"
    }`;

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Settings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Manage your account, appearance and security.</p>

      <div className="mt-6 max-w-2xl space-y-4">
        {/* 1 · Account */}
        <section className="rounded-lg border border-[#E9EEF4] bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={user?.name} color={user?.avatarColor} src={user?.photoURL} size={44} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{user?.name}</div>
                <div className="truncate text-sm text-muted-foreground">{user?.title} · {user?.role}</div>
              </div>
            </div>
            <Link to="/profile">
              <Button variant="ghost"><User size={15} /> Manage profile</Button>
            </Link>
          </div>
        </section>

        {/* 2 · Appearance */}
        <section className="rounded-lg border border-[#E9EEF4] bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-foreground">Appearance</div>
              <div className="text-sm text-muted-foreground">Choose how Hyre looks on this device.</div>
            </div>
            <div className="flex gap-2">
              <button className={themeBtn(theme === "light")} onClick={() => chooseTheme("light")}>
                <Sun size={15} /> Light
              </button>
              <button className={themeBtn(theme === "dark")} onClick={() => chooseTheme("dark")}>
                <Moon size={15} /> Dark
              </button>
            </div>
          </div>
        </section>

        {/* 3 · Security */}
        <section className="rounded-lg border border-[#E9EEF4] bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-foreground">Security</div>
              <div className="text-sm text-muted-foreground">Send yourself a link to reset your password.</div>
            </div>
            <Button variant="ghost" onClick={resetPw} disabled={sending}>
              <Mail size={15} /> {sending ? "Sending…" : "Send reset link"}
            </Button>
          </div>
          {resetMsg && (
            <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${resetMsg.ok ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
              {resetMsg.ok ? <Check size={15} /> : <AlertCircle size={15} />} {resetMsg.text}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
