import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { BrandWordmark } from "@/components/layout/BrandMark";
import { AuraIllustration } from "@/components/layout/AuraIllustration";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "admin@aadhyaraj.com" },
  { label: "HR Admin", email: "hr.admin@aadhyaraj.com" },
  { label: "Manager", email: "manager.demo@aadhyaraj.com" },
  { label: "Recruiter", email: "recruiter.demo@aadhyaraj.com" },
  { label: "Finance", email: "finance.demo@aadhyaraj.com" },
  { label: "Employee", email: "employee.demo@aadhyaraj.com" },
];
const DEMO_PASSWORD = "Welcome@123";

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate("/app/dashboard");
    } catch (err) {
      showToast(getErrorMessage(err, "We couldn't sign you in. Check your details and try again."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (email: string) => {
    setValue("email", email);
    setValue("password", DEMO_PASSWORD);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-12 lg:flex">
        <BrandWordmark size={36} />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <AuraIllustration className="w-full max-w-md drop-shadow-2xl" />
        </div>
        <div className="relative z-10">
          <p className="font-display text-2xl font-medium leading-snug text-white">
            "The new HRMS turned our scattered HR processes into one calm, connected system."
          </p>
          <p className="mt-4 text-sm text-white/70">Mira Sharma · Chief Executive Officer, Aadhyaraj Technologies</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-gold-300/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandWordmark />
          </div>
          <h1 className="font-display text-2xl font-medium text-ink">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-faint">Sign in to your Aadhyaraj HRMS workspace.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <TextField label="Work email" type="email" placeholder="you@aadhyaraj.com" required error={errors.email?.message} {...register("email")} />
            <TextField label="Password" type="password" placeholder="••••••••" required error={errors.password?.message} {...register("password")} />
            <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
              Sign in
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink-faint">
              <ShieldCheck size={14} /> Quick demo access
            </div>
            <p className="mt-1.5 text-[12px] text-ink-faint">Tap a role to autofill credentials, then sign in.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc.email)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-10 text-center text-[12px] text-ink-faint">
            <Link to="/" className="hover:text-ink-soft">← Back to homepage</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
