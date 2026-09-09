// Section 7 of CLAUDE.md: "the health check runs on app load and surfaces a
// visible warning, not a console line." Previously the only health check ran
// inside ApplyModal and only ever logged to the console — invisible to
// anyone without devtools open, and only triggered once a candidate had
// already opened the apply form. This runs once, app-wide, the moment Hyre
// loads, and — only if an AI Worker endpoint is actually down — renders a
// warning bar nobody can miss.
//
// Deliberately renders nothing in the healthy case: this is a fault
// indicator, not a status dashboard.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { checkAiWorkersHealth } from "@/lib/cv-extract";

export default function WorkerHealthBanner() {
  const [failed, setFailed] = useState(null); // null = still checking / healthy

  useEffect(() => {
    let cancelled = false;
    checkAiWorkersHealth().then((result) => {
      if (!cancelled && !result.ok) setFailed(result.failed);
    });
    return () => { cancelled = true; };
  }, []);

  if (!failed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="relative z-[150] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-[13px] font-medium text-destructive-foreground"
    >
      <AlertTriangle size={15} className="shrink-0" />
      <span>
        CV screening is currently unreachable ({failed.join(", ")}). Applications may not be processed correctly
        until this is fixed — see the console for details.
      </span>
    </div>
  );
}
