// "Filter with AI" — HR types the skills / criteria / rules they want, and a
// Cloudflare Worker (Meta Llama via Workers AI) REASONS over every active
// candidate in this position: it infers must-haves vs nice-to-haves, honours
// flexible instructions (e.g. "skills over qualifications", "open to strong
// juniors"), and returns a ranked shortlist with an overall summary, a verdict and
// a reason each. It ranks and explains only — a human still makes every decision,
// judging solely on skills / experience / qualifications (no personal attributes).
import { useState } from "react";
import { Sparkles, Search, Loader2, AlertCircle, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

const AI_URL = import.meta.env.VITE_AI_FILTER_URL;

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

export default function AiFilter({ candidates = [], onOpen }) {
  const [criteria, setCriteria] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null); // { summary, ranked: [{id, score, verdict, reason}] }

  if (!AI_URL) return null; // feature not configured → hide entirely

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

    // Abort if the worker takes too long, so the button never hangs forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: q, candidates: pool.map(toPayload) }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.ranked)) {
        throw new Error(data.error || "The AI screening service didn't return a result. Please try again.");
      }
      setResults({ summary: data.summary || "", ranked: data.ranked });
    } catch (e) {
      // A raw "Failed to fetch" / AbortError / TypeError means the request never
      // reached the worker — the service itself is fine. On the user's end this is
      // almost always an ad blocker or privacy shield, or a school/work/Wi-Fi
      // network or DNS blocking the *.workers.dev host. Show something they can
      // act on instead of the browser's scary raw message.
      const blocked =
        e.name === "AbortError" ||
        e.name === "TypeError" ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(e.message || "");
      setError(
        blocked
          ? "Couldn't reach the AI screening service — the request was blocked before it left your device. This is usually an ad blocker or browser privacy shield, or a school/work Wi‑Fi or DNS blocking the host it runs on. Try pausing ad blockers for this site, or switch to another network or device. (Everything else in Hyre still works normally.)"
          : e.message || "The AI screening service had a problem. Please try again in a moment."
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
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
    <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-foreground">
        <Sparkles size={16} className="text-primary" /> Filter with AI
        <span className="font-medium text-muted-foreground">— describe your ideal candidate or the rules to apply; AI reasons over everyone and ranks the best.</span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <input
            value={criteria}
            onChange={(e) => { setCriteria(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !loading && run()}
            placeholder='e.g. "5+ yrs React & TypeScript, led a team — but skills matter more than the degree"'
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button onClick={() => run()} disabled={loading} className="shrink-0">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Screening…</> : <><Sparkles size={16} /> Filter with AI</>}
        </Button>
      </div>

      {/* example smart commands */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setCriteria(ex); setError(""); }}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
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
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-secondary"
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
