// Help & support — a few common questions and a way to get in touch.
import { Mail, MessageCircle } from "lucide-react";

const FAQ = [
  {
    q: "How do I move a candidate to the next stage?",
    a: "Open a position, find the candidate's card, and use “Move to next stage”. From the Applied stage that's a single click; after that you first add a comment and a score in the candidate's details.",
  },
  {
    q: "Why can't I move someone without leaving a review?",
    a: "Every stage after Applied requires a comment and a score, so decisions stay fair and comparable. The review is recorded in the candidate's timeline.",
  },
  {
    q: "What happens to rejected candidates?",
    a: "They're never deleted — they stay in the talent pool with the reason recorded, ready to be reconsidered for a future role.",
  },
  {
    q: "Who can see my application?",
    a: "Only the hiring team at the company. Applicants can see just their own applications and status.",
  },
];

export default function Help() {
  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Help &amp; support</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Answers to common questions — and how to reach us.</p>

      <div className="mt-6 max-w-2xl space-y-4">
        <section className="divide-y divide-border rounded-lg border border-[#E9EEF4] bg-card shadow-card">
          {FAQ.map((item) => (
            <div key={item.q} className="p-5">
              <div className="text-sm font-semibold text-foreground">{item.q}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E9EEF4] bg-card p-5 shadow-card">
          <div>
            <div className="text-sm font-semibold text-foreground">Still need help?</div>
            <div className="text-sm text-muted-foreground">Our team usually replies within a day.</div>
          </div>
          <a
            href="mailto:support@hyre.app"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Mail size={15} /> Contact support
          </a>
        </section>
      </div>
    </div>
  );
}
