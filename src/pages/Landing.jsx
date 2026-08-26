// Hyre public homepage. A visitor in a hurry must find the way into the app
// instantly: a single Login button top-right (where eyes expect it), one big
// hero CTA, and a closing CTA band. The "Create a candidate account" link jumps
// straight to the registration form.
import { useLayoutEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShieldCheck, Users, GitBranch, Lightbulb } from "lucide-react";
import { animate, stagger, utils, spring } from "animejs";
import { useAuth } from "@/context/AuthContext";
import { prefersReduced, SPRING_SOFT } from "@/lib/motion";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import AmbientShapes from "@/animations/AmbientShapes";

const FEATURES = [
  { icon: GitBranch, title: "An enforced process", body: "Every candidate moves through the same fair, multi-stage process — no steps skipped, no shortcuts." },
  { icon: Users, title: "The right people decide", body: "HR screens, the department interviews, management makes the final call. Each stage owned by the right role." },
  { icon: ShieldCheck, title: "Nobody is lost", body: "Rejected candidates stay in a searchable talent pool — ready for the next role that fits them." },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navRef = useRef(null);
  const heroRef = useRef(null);
  const underlineRef = useRef(null);
  const played = useRef(false);
  // Sections below the fold reveal as they scroll into view. Gated on `!loading`
  // so setup runs on the render that actually mounts these sections (not the
  // auth-check loading screen, when they aren't in the DOM yet).
  const featuresRef = useScrollReveal(!loading, { stagger: 130, distance: 44 });
  const ctaRef = useScrollReveal(!loading, { distance: 52, stagger: 0 });

  // Load-in: the nav eases down, the hero copy springs up in sequence, then the
  // gold highlight under the headline wipes in from the left. Calm and premium —
  // the hero IMAGE is deliberately left completely static (no entrance / float).
  useLayoutEffect(() => {
    if (loading || played.current || !heroRef.current || prefersReduced()) return;
    played.current = true;
    const kids = heroRef.current.querySelectorAll(":scope > *");
    try {
      if (navRef.current) {
        utils.set(navRef.current, { opacity: 0, translateY: -14 });
        animate(navRef.current, {
          opacity: { to: 1, duration: 500, ease: "out(2)" },
          translateY: { to: 0, ease: spring(SPRING_SOFT) },
        });
      }
      utils.set(kids, { opacity: 0, translateY: 22 });
      animate(kids, {
        opacity: { to: 1, duration: 550, ease: "out(3)" },
        translateY: { to: 0, ease: spring(SPRING_SOFT) },
        delay: stagger(95, { start: 140 }),
      });
      if (underlineRef.current) {
        utils.set(underlineRef.current, { scaleX: 0 });
        animate(underlineRef.current, {
          scaleX: { to: 1, duration: 720, ease: "out(4)" },
          delay: 640, // wait for the headline to land, then wipe the highlight in
        });
      }
    } catch {
      utils.set?.(kids, { opacity: 1, translateY: 0 });
      if (underlineRef.current) utils.set?.(underlineRef.current, { scaleX: 1 });
      if (navRef.current) utils.set?.(navRef.current, { opacity: 1, translateY: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Candidates ALWAYS see the home page — it's their entry point (browse + apply),
  // so they're never auto-forwarded away from it. Signed-in STAFF, however, skip the
  // marketing homepage and drop straight into the app (Firebase remembers the
  // session, so returning staff go right to work without a home/login detour).
  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</div>;
  if (user && user.role !== "Candidate") return <Navigate to="/app" replace />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV — brand left, the single way in on the right */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div ref={navRef} className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={36} />
            <span className="text-xl font-extrabold tracking-tight">Hyre</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-extrabold text-black shadow-[0_4px_14px_rgba(245,197,24,0.5)] transition-transform hover:-translate-y-0.5"
            >
              Sign in <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <AmbientShapes />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-12 lg:py-24">
          <div ref={heroRef} className="space-y-6 sm:space-y-7">
            {/* badge + a simple static bulb that lights up (flickers) in dark mode */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/60 bg-gold/15 px-3.5 py-1.5 text-xs font-bold text-foreground">
                <span className="h-2 w-2 rounded-full bg-gold" /> Recruitment, refined — built for modern teams
              </span>
              <Lightbulb className="hero-bulb" size={34} strokeWidth={2.25} aria-hidden="true" />
            </div>

            {/* Fluid type: scales continuously with viewport width (clamp) instead of
                jumping at fixed breakpoints — smooth at every window size in between. */}
            <h1 className="text-[clamp(2.25rem,1.5rem+3.5vw,3.75rem)] font-extrabold leading-[1.06] tracking-tight">
              Your next role,
              <br />
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">one clear process.</span>
                <span ref={underlineRef} className="absolute bottom-1 left-0 z-0 h-3.5 w-full origin-left bg-gold/50 sm:h-4" />
              </span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Hyre is the hiring platform that keeps every candidate, interview and
              decision in one fair, transparent flow — for applicants and hiring teams alike.
            </p>

            {/* single primary CTA */}
            <div className="pt-1">
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-base font-extrabold text-black shadow-[0_8px_24px_rgba(245,197,24,0.55)] transition-transform hover:-translate-y-0.5 sm:w-auto sm:px-7 sm:py-4 sm:text-lg"
              >
                Go to Hyre <ArrowRight size={20} />
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              Applying for a job? <Link to="/login?mode=register" className="font-bold text-foreground underline decoration-gold decoration-2 underline-offset-2">Create a candidate account</Link> — it takes a minute.
            </p>
          </div>

          {/* hero image — intentionally STATIC (no entrance, float or tilt); just a
              soft golden glow behind it. Day + night stacked → theme toggle crossfades. */}
          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gold/25 blur-2xl" />
            <div className="hero-photo border border-border shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <img
                src="/home/hero.png?v=4"
                alt="A hiring team congratulating a new hire in Hyre"
                className="hero-photo-day"
              />
              <img
                src="/home/hero-night.png?v=4"
                alt=""
                aria-hidden="true"
                className="hero-photo-night"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — stagger into view on scroll; each card lifts on hover. The
          reveal transform lives on the wrapper so it never fights the hover transform. */}
      <section className="mx-auto max-w-6xl px-5 pb-8 sm:px-6">
        <div ref={featuresRef} className="grid gap-4 sm:gap-5 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="h-full">
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1.5 hover:border-gold/40 hover:shadow-pop">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-foreground transition-transform duration-300 group-hover:scale-110">
                  <Icon size={22} />
                </div>
                <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CLOSING CTA BAND — the whole band fades + rises in as it scrolls into view */}
      <section ref={ctaRef} className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col items-center gap-6 rounded-3xl bg-black px-6 py-12 text-center text-white sm:px-8 sm:py-14">
          <h2 className="max-w-2xl text-[clamp(1.5rem,1.25rem+1.5vw,2.25rem)] font-extrabold tracking-tight">
            Ready to hire — or get hired?
          </h2>
          <p className="max-w-md text-white/70">
            Jump straight into Hyre. Candidates apply, teams review, decisions get made — all in one place.
          </p>
          <Link
            to="/login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-base font-extrabold text-black shadow-[0_8px_24px_rgba(245,197,24,0.4)] transition-transform hover:-translate-y-0.5 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
          >
            Go to Hyre <ArrowRight size={20} />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-sm text-white/60">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-gold" /> Fair, enforced process</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-gold" /> Role-based access</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-gold" /> Talent pool that remembers</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-bold text-foreground">Hyre</span>
          </div>
          <span>Recruitment, refined.</span>
        </div>
      </footer>
    </div>
  );
}
