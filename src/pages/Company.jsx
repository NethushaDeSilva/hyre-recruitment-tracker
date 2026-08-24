// Company profile — the organisation using Hyre. Placeholder for now; the real
// company details (branding, departments, address) will be filled in later.
import { Building2, Globe, MapPin } from "lucide-react";
import { COMPANY } from "@/lib/company";

export default function Company() {
  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Company profile</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Your organisation's details on Hyre.</p>

      <div className="mt-6 max-w-2xl space-y-4">
        <section className="rounded-lg border border-[#E9EEF4] bg-card p-6 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold text-black">
              <Building2 size={28} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-foreground">{COMPANY.name}</div>
              <div className="text-sm text-muted-foreground">{COMPANY.tagline}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              <Globe size={15} className="shrink-0" /> {COMPANY.website}
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              <MapPin size={15} className="shrink-0" /> Colombo, Sri Lanka
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          More company details — branding, departments, hiring locations and billing —
          are coming soon.
        </section>
      </div>
    </div>
  );
}
