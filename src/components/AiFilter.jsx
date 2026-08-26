// "AI Mode" screening panel — opened from the ✨ AI Mode button on the board
// search bar (see PositionDetail). HR types the skills / criteria / rules they
// want, and a Cloudflare Pages Function (Meta Llama via Workers AI) REASONS over
// every active candidate: it infers must-haves vs nice-to-haves, honours flexible
// instructions (e.g. "skills over qualifications", "open to strong juniors"), and
// returns a ranked shortlist with an overall summary, a verdict and a reason each.
// It ranks and explains only — a human still makes every decision, judging solely
// on skills / experience / qualifications (no personal attributes).
//
// Rendered inside a popover, so it takes NO permanent space on the page.
import { useState, useLayoutEffect, useRef } from "react";
import { Sparkles, Search, Loader2, AlertCircle, X, ChevronRight } from "lucide-react";
import { animate, utils, spring } from "animejs";
import { prefersReduced, SPRING_POP } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

// Same-origin by default (Cloudflare Pages Function at /api/screen); an env
// override is honoured if you ever want to point elsewhere.
const AI_URL = import.meta.env.VITE_AI_FILTER_URL || "/api/screen";

// Example "smart commands" — click to drop one into the box.
const EXAMPLES = [
  "Prioritize practical skills over formal qualifications",
  "Strong React & TypeScript; leadership a plus",
  "Open to high-potential juniors who can do the work",
  "Must have 5+ years; fintech experience preferred",
];

// Only job-relevant fields are ever sent — no demographic data exists to leak.
const toPayload = (c) => ({
  id: c.id,
  name: c.name,
  appliedRole: c.appliedRole,
  highestQualification: c.highestQualification,
  fieldOfStudy: c.fieldOfStudy,
  experience: c.experience,
  currentRole: c.currentRole,
  currentCompany: c.currentCompany,
  skills: c.skills,
  coverNote: c.coverNote,
});

export default function AiFilter({ candidates = [], onOpen, onClose }) {
  const [criteria, setCriteria] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null); // { summary, ranked: [{id, score, verdict, reason}] }
  const panelRef = useRef(null);

  // Springs in on mount (opacity/scale/translateY only — GPU-composited, matches
  // the Modal's entrance so every popover in the app feels like one system).
  useLayoutEffect(() => {
    if (prefersReduced() || !panelRef.current) return;
    try {
      utils.set(panelRef.current, { opacity: 0, scale: 0.97, translateY: -6 });
      animate(panelRef.current, {
        opacity: { to: 1, duration: 160, ease: "out(2)" },
        scale: { to: 1, ease: spring(SPRING_POP) },
        translateY: { to: 0, ease: spring(SPRING_POP) },
      });
    } catch {
      utils.set?.(panelRef.current, { opacity: 1, scale: 1, translateY: 0 });
    }
  }, []);

  // Screen only people still in play — skip rejected and already-hired.
  const pool = candidates.filter((c) => c.stage !== "rejected" && c.stage !== "hired");
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const run = async (text) => {
    const q = (text ?? criteria).trim();
    if (!q) return setError("Type the skills, criteria or rules you're looking for first.");
    if (!pool.length) return setError("There are no active candidates to screen in this position.");
    setLoading(true);
    setError("");
    setResults(null);

    const payload = JSON.stringify({ criteria: q, candidates: pool.map(toPayload) });
    let lastErr;
    // Try twice — a transient blip on the first call self-heals on the retry.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const res = await fetch(AI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.ranked)) {
          throw new Error(data.error || "The AI screening service didn't return a result. Please try again.");
        }
        setResults({ summary: data.summary || "", ranked: data.ranked });
        clearTimeout(timer);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
        clearTimeout(timer);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800)); // brief pause, then retry
      }
    }
    // Both attempts failed — show a friendly, actionable message (never a raw crash).
    const e = lastErr || {};
    const blocked =
      e.name === "AbortError" ||
      e.name === "TypeError" ||
      /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || "");
    setError(
      blocked
        ? "Couldn't reach the AI screening service. If this keeps happening, try pausing ad blockers for this site or switching network."
        : e.message || "The AI screening service had a problem. Please try again in a moment."
    );
    setLoading(false);
  };

  const scorePill = (s) =>
    s >= 75
      ? "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]"
      : s >= 50
      ? "bg-[#E0A422]/15 text-[#B4801A] dark:text-[#F5D77E]"
      : "bg-[#DC2626]/10 text-[#DC2626] dark:text-[#F87171]";
  const verdictText = (v) =>
    v === "Strong"
      ? "text-[#16A34A] dark:text-[#4ADE80]"
      : v === "Possible"
      ? "text-[#B4801A] dark:text-[#F5D77E]"
      : "text-[#DC2626] dark:text-[#F87171]";

  return (
    <div ref={panelRef} className="max-h-[70vh] w-full origin-top overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 shadow-pop will-change-transform">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-foreground">
          <Sparkles size={16} className="text-primary" /> AI screening
          <span className="font-medium text-muted-foreground">— describe your ideal candidate or the rules to apply; AI reasons over everyone and ranks the best.</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Close AI screening">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <input
            value={criteria}
            autoFocus
            onChange={(e) => { setCriteria(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !loading && run()}
            placeholder='e.g. "5+ yrs React & TypeScript, led a team — but skills matter more than the degree"'
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button onClick={() => run()} disabled={loading} className="shrink-0">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Screening…</> : <><Sparkles size={16} /> Screen</>}
        </Button>
      </div>

      {/* example smart commands */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setCriteria(ex); setError(""); }}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[#DC2626]/40 bg-[#FBE9E9] px-3 py-2.5 text-[13px] font-medium text-[#B23A2E] dark:bg-[#DC2626]/10 dark:text-[#F1A9A0]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {results && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-foreground">Best matches ({results.ranked.length})</span>
            <button onClick={() => setResults(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <X size={13} /> Clear
            </button>
          </div>

          {/* AI's overall take on the shortlist */}
          {results.summary && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2.5 text-[13px] text-foreground">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" /> <span>{results.summary}</span>
            </div>
          )}

          {results.ranked.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No candidates matched.</p>
          ) : (
            <div className="space-y-2">
              {results.ranked.map((r, i) => {
                const c = byId.get(r.id);
                if (!c) return null;
                return (
                  <button
                    key={r.id}
                    onClick={() => onOpen?.(c)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-secondary"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                    <Avatar name={c.name} color={c.avatarColor} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
                        <span className={`shrink-0 text-[11px] font-bold ${verdictText(r.verdict)}`}>{r.verdict}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{r.reason}</div>
                    </div>
                    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${scorePill(r.score)}`}>{r.score}%</span>
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-2.5 text-[11px] text-muted-foreground">
            AI suggestions only — it ranks on skills, experience and qualifications. You make the final decision.
          </p>
        </div>
      )}
    </div>
  );
}
