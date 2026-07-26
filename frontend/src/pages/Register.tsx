import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/api";
import { AuthApi } from "@/lib/endpoints";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { BrandWordmark } from "@/components/layout/BrandMark";
import { AuraIllustration } from "@/components/layout/AuraIllustration";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
  confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof schema>;

export default function Register() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await AuthApi.register(values.email, values.password, values.confirmPassword);
      showToast("Account created. You can sign in now.", "success");
      navigate("/login");
    } catch (err) {
      showToast(getErrorMessage(err, "We couldn't create your account."), "error");
    } finally {
      setSubmitting(false);
    }
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
            "Create your employee account and start managing your HR experience in one place."
          </p>
          <p className="mt-4 text-sm text-white/70">Aadhyaraj HRMS · Employee onboarding</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-gold-300/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandWordmark />
          </div>
          <h1 className="font-display text-2xl font-medium text-ink">Create your account</h1>
          <p className="mt-1.5 text-sm text-ink-faint">Register as an employee to access your HR workspace.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <TextField label="Work email" type="email" placeholder="you@aadhyaraj.com" required error={errors.email?.message} {...register("email")} />
            <TextField label="Password" type="password" placeholder="••••••••" required error={errors.password?.message} {...register("password")} />
            <TextField label="Confirm password" type="password" placeholder="••••••••" required error={errors.confirmPassword?.message} {...register("confirmPassword")} />
            <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
              Create account
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-line/70 bg-white p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink-faint">
              <ShieldCheck size={14} /> Your account will be created as an employee profile.
            </div>
            <p className="mt-1.5 text-[12px] text-ink-faint">Once registered, you can sign in immediately and update your personal details.</p>
          </div>

          <p className="mt-10 text-center text-[12px] text-ink-faint">
            Already have an account? <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
