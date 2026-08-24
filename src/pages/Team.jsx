// Team & permissions — who's on the hiring team and what each role can do.
// Mirrors the role model in src/lib/stages.js / permissions.js.
import { Check } from "lucide-react";
import { ROLE_USERS } from "@/context/auth-config";
import { Avatar } from "@/components/ui/Avatar";

const TEAM = [ROLE_USERS.HR, ROLE_USERS.Interviewer, ROLE_USERS.Management];

const ROLE_BADGE = {
  HR: { bg: "#E7EEFE", fg: "#2563EB" },
  Interviewer: { bg: "#ECEBFB", fg: "#4F46E5" },
  Management: { bg: "#FBF1DC", fg: "#A9781A" },
};

const PERMISSIONS = [
  { role: "HR", can: ["Create & manage positions", "Screen applicants and move them from Applied", "Reject with a reason (kept in the talent pool)"] },
  { role: "Interviewer", can: ["Review candidates in the interview stages they own", "Score & comment before advancing", "Cannot create positions or decide the final hire"] },
  { role: "Management", can: ["Oversight of every stage", "Make the final hiring decision", "Everything HR can do"] },
];

export default function Team() {
  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Team &amp; permissions</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Who's on the hiring team, and what each role is allowed to do.</p>

      <div className="mt-6 max-w-3xl space-y-6">
        {/* team members */}
        <section>
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Team members</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TEAM.map((m) => {
              const badge = ROLE_BADGE[m.role];
              return (
                <div key={m.role} className="rounded-lg border border-[#E9EEF4] bg-card p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.avatarColor} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.title}</div>
                    </div>
                  </div>
                  <span className="mt-3 inline-block rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: badge.bg, color: badge.fg }}>
                    {m.role}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* permissions */}
        <section>
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">What each role can do</h2>
          <div className="space-y-3">
            {PERMISSIONS.map((p) => (
              <div key={p.role} className="rounded-lg border border-[#E9EEF4] bg-card p-4 shadow-card">
                <div className="text-sm font-bold text-foreground">{p.role}</div>
                <ul className="mt-2 space-y-1.5">
                  {p.can.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check size={15} className="mt-0.5 shrink-0 text-[#16A34A]" /> {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
