import { Link } from "react-router-dom";
import {
  ArrowRight, Users, CalendarDays, Wallet, Briefcase, Target, ShieldCheck,
  Sparkles, Clock, CheckCircle2, Star,
} from "lucide-react";
import { BrandWordmark } from "@/components/layout/BrandMark";
import { AuraIllustration } from "@/components/layout/AuraIllustration";
import { Button } from "@/components/ui/Button";

const FEATURES = [
  { icon: Users, title: "Employee Lifecycle", desc: "Onboarding, 360° profiles, org charts, and offboarding — all in one connected record.", tone: "brand" },
  { icon: Clock, title: "Attendance", desc: "One-tap check-in, automatic work hours, and regularization requests that don't need spreadsheets.", tone: "success" },
  { icon: CalendarDays, title: "Leave Management", desc: "Smart balances, manager approvals, and a shared calendar everyone can see at a glance.", tone: "gold" },
  { icon: Briefcase, title: "Recruitment", desc: "A visual pipeline from application to offer, with interview scheduling built in.", tone: "brand" },
  { icon: Target, title: "Performance", desc: "Review cycles, goals, and ratings that actually get completed — not buried in email.", tone: "warning" },
  { icon: Wallet, title: "Payroll", desc: "Salary structures, automated runs, and clean digital payslips your finance team will love.", tone: "success" },
];

const STATS = [
  { value: "9", label: "Connected modules" },
  { value: "60%", label: "Less manual HR work" },
  { value: "100%", label: "Audit-ready records" },
  { value: "24/7", label: "Self-service access" },
];

const TONE_BG: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600", success: "bg-success-50 text-success-700", gold: "bg-gold-50 text-gold-700", warning: "bg-warning-50 text-warning-700",
};

export default function Landing() {
  return (
    <div className="bg-canvas">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <BrandWordmark />
          <nav className="hidden items-center gap-8 text-[14px] font-medium text-ink-soft md:flex">
            <a href="#modules" className="hover:text-ink">Modules</a>
            <a href="#why" className="hover:text-ink">Why Aadhyaraj</a>
            <a href="#stats" className="hover:text-ink">Impact</a>
          </nav>
          <Link to="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20 sm:pt-20">
        <div className="pointer-events-none absolute -top-40 right-0 h-[32rem] w-[32rem] rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-gold-100/50 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
              <Sparkles size={13} /> The HR platform for Aadhyaraj Technologies
            </span>
            <h1 className="mt-5 font-display text-[40px] font-medium leading-[1.1] tracking-tight text-ink sm:text-[52px]">
              People operations, run like a <span className="text-brand-600">premium product.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-faint">
              One calm, connected workspace for attendance, leave, payroll, recruitment, and performance —
              built so every employee, manager, and HR leader gets exactly what they need, instantly.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login">
                <Button size="lg" rightIcon={<ArrowRight size={16} />}>Explore the platform</Button>
              </Link>
              <a href="#modules">
                <Button size="lg" variant="outline">See what's inside</Button>
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-[13px] text-ink-faint">
              <span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-success-500" /> Role-based access control</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-success-500" /> Built for real org hierarchies</span>
            </div>
          </div>

          <div className="relative animate-fade-up [animation-delay:120ms]">
            <AuraIllustration className="w-full max-w-lg" />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="border-y border-line/70 bg-white py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-medium text-brand-600">{s.value}</p>
              <p className="mt-1 text-[13px] text-ink-faint">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-medium text-ink">Everything HR needs, nothing it doesn't</h2>
            <p className="mt-3 text-[15px] text-ink-faint">
              Each module is built to remove a real bottleneck — fewer spreadsheets, fewer follow-up emails, more time for the work that matters.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-3xl border border-line/70 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lifted">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONE_BG[f.tone]}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="mt-4 font-display text-[17px] font-medium text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-faint">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why section */}
      <section id="why" className="bg-white px-6 py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-medium text-ink">Designed around how HR teams actually work</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-faint">
              Aadhyaraj HRMS replaces a patchwork of spreadsheets and email threads with one source of truth —
              so leadership sees the health of the organization at a glance, managers spend less time on admin,
              and every employee gets a transparent, self-serve experience.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Real-time dashboards for headcount, attendance, and attrition",
                "Approval workflows that route to the right manager automatically",
                "Granular role-based permissions across every module",
                "Built to scale from a growing team to a thousand-person org",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success-500" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-line/70 bg-gradient-to-br from-canvas to-white p-8 shadow-card">
            <div className="flex items-center gap-1 text-gold-500">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill="currentColor" strokeWidth={0} />)}
            </div>
            <p className="mt-4 font-display text-[20px] leading-snug text-ink">
              "We moved every HR workflow into one platform in a single quarter. Approvals that took days now take minutes."
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">RS</div>
              <div>
                <p className="text-[13px] font-medium text-ink">Radhika Sharma</p>
                <p className="text-[12px] text-ink-faint">VP of Human Resources, Aadhyaraj Technologies</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl rounded-4xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-16 text-center shadow-lifted sm:px-16">
          <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">Step inside your new HR command center</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-white/75">
            Explore live dashboards, real approval workflows, and a fully populated organization — ready the moment you sign in.
          </p>
          <div className="mt-8 flex justify-center">
            <Link to="/login">
              <Button size="lg" variant="secondary" className="bg-white text-brand-700 hover:bg-white/90" rightIcon={<ArrowRight size={16} />}>
                Sign in to explore
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line/70 px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <BrandWordmark size={26} />
          <p className="text-[12px] text-ink-faint">© {new Date().getFullYear()} Aadhyaraj Technologies. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
