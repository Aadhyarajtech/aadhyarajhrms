import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getErrorMessage } from "@/lib/api";
import { AuthApi } from "@/lib/endpoints";
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
  { label: "IT Support", email: "it.support.demo@aadhyaraj.com" },
  { label: "Employee", email: "employee.demo@aadhyaraj.com" },
];
const DEMO_PASSWORD = "Welcome@123";

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters long.");

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "otp">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate("/app/dashboard");
    } catch (err) {
      showToast(
        getErrorMessage(
          err,
          "We couldn't sign you in. Check your details and try again.",
        ),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (email: string) => {
    setValue("email", email);
    setValue("password", DEMO_PASSWORD);
  };

  const openForgotPassword = () => {
    setForgotEmail("");
    setOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    setForgotStep("email");
    setForgotOpen(true);
  };

  const closeForgotPassword = () => {
    setForgotOpen(false);
    setForgotStep("email");
    setOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const sendOtp = async () => {
    const email = forgotEmail.trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      showToast("Enter a valid work email address.", "error");
      return;
    }

    if (Date.now() < resendAvailableAt) {
      showToast("Please wait before requesting another OTP.", "error");
      return;
    }

    setForgotSubmitting(true);
    try {
      await AuthApi.requestPasswordResetOtp(email);
      setForgotEmail(email);
      setForgotStep("otp");
      setResendAvailableAt(Date.now() + 60_000);
      setNow(Date.now());
      showToast("If an active account exists, an OTP has been sent to your email.", "success");
    } catch (err) {
      showToast(
        getErrorMessage(err, "We couldn't send the OTP. Please try again."),
        "error",
      );
    } finally {
      setForgotSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!/^\d{6}$/.test(otp)) {
      showToast("Enter the 6-digit OTP from your email.", "error");
      return;
    }
    if (!passwordRule.safeParse(newPassword).success) {
      showToast("New password must be at least 8 characters long.", "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setForgotSubmitting(true);
    try {
      await AuthApi.resetPasswordWithOtp(
        forgotEmail,
        otp,
        newPassword,
        confirmNewPassword,
      );
      showToast("Password reset successfully. You can sign in now.", "success");
      setValue("email", forgotEmail);
      setValue("password", "");
      closeForgotPassword();
    } catch (err) {
      showToast(
        getErrorMessage(err, "The OTP is invalid or has expired. Please request a new OTP."),
        "error",
      );
    } finally {
      setForgotSubmitting(false);
    }
  };

  useEffect(() => {
    if (!forgotOpen || forgotStep !== "otp" || resendAvailableAt <= Date.now()) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [forgotOpen, forgotStep, resendAvailableAt]);

  const resendSeconds = Math.max(
    0,
    Math.ceil((resendAvailableAt - now) / 1000),
  );

  if (forgotOpen) {
    return (
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-12 lg:flex">
          <BrandWordmark size={36} />
          <div className="relative z-10 flex flex-1 items-center justify-center">
            <AuraIllustration className="w-full max-w-md drop-shadow-2xl" />
          </div>
          <div className="relative z-10">
            <p className="font-display text-2xl font-medium leading-snug text-white">
              Secure access to your Aadhyaraj HRMS workspace.
            </p>
            <p className="mt-4 text-sm text-white/70">
              Password recovery is protected with a one-time email OTP.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-gold-300/20 blur-3xl" />
        </div>

        <div className="flex items-center justify-center bg-canvas px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <BrandWordmark />
            </div>

            <button
              type="button"
              onClick={closeForgotPassword}
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-faint hover:text-ink-soft"
            >
              <ArrowLeft size={16} /> Back to sign in
            </button>

            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {forgotStep === "email" ? <Mail size={20} /> : <KeyRound size={20} />}
            </div>

            <h1 className="font-display text-2xl font-medium text-ink">
              {forgotStep === "email" ? "Forgot your password?" : "Enter your OTP"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-ink-faint">
              {forgotStep === "email"
                ? "Enter your work email and we'll send you a one-time password reset code."
                : `Enter the 6-digit OTP sent to ${forgotEmail}. It expires in 10 minutes.`}
            </p>

            {forgotStep === "email" ? (
              <div className="mt-7 space-y-4">
                <TextField
                  label="Work email"
                  type="email"
                  placeholder="you@aadhyaraj.com"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  required
                />
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  isLoading={forgotSubmitting}
                  onClick={() => void sendOtp()}
                >
                  Send OTP
                </Button>
              </div>
            ) : (
              <div className="mt-7 space-y-4">
                <div>
                  <label className="text-[13px] font-medium text-ink-soft">
                    One-time password <span className="text-danger-500">*</span>
                  </label>
                  <input
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    className="mt-1.5 h-12 w-full rounded-xl border border-line bg-white px-3.5 text-center text-lg font-semibold tracking-[0.35em] text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                <div>
                  <label className="text-[13px] font-medium text-ink-soft">
                    New password <span className="text-danger-500">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="h-10 w-full rounded-xl border border-line bg-white px-3.5 pr-11 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((value) => !value)}
                      aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-faint hover:bg-black/5 hover:text-ink-soft"
                    >
                      {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[13px] font-medium text-ink-soft">
                    Confirm new password <span className="text-danger-500">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showConfirmNewPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Repeat your new password"
                      className="h-10 w-full rounded-xl border border-line bg-white px-3.5 pr-11 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword((value) => !value)}
                      aria-label={showConfirmNewPassword ? "Hide confirmed password" : "Show confirmed password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-faint hover:bg-black/5 hover:text-ink-soft"
                    >
                      {showConfirmNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  isLoading={forgotSubmitting}
                  onClick={() => void resetPassword()}
                >
                  Reset password
                </Button>

                <div className="flex items-center justify-between text-[12px] text-ink-faint">
                  <button
                    type="button"
                    disabled={forgotSubmitting || resendSeconds > 0}
                    onClick={() => void sendOtp()}
                    className="font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : "Resend OTP"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep("email")}
                    className="hover:text-ink-soft"
                  >
                    Change email
                  </button>
                </div>
              </div>
            )}

            <p className="mt-7 text-center text-[12px] text-ink-faint">
              For your security, OTPs expire after 10 minutes and are limited to 5 incorrect attempts.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          <p className="mt-4 text-sm text-white/70">
            Mira Sharma · Chief Executive Officer, Aadhyaraj Technologies
          </p>
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
          <p className="mt-1.5 text-sm text-ink-faint">
            Sign in to your Aadhyaraj HRMS workspace.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <TextField
              label="Work email"
              type="email"
              placeholder="you@aadhyaraj.com"
              required
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-ink-soft">
                Password <span className="text-danger-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`h-10 w-full rounded-xl border bg-white px-3.5 pr-11 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${errors.password ? "border-danger-500" : "border-line"}`}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-faint hover:bg-black/5 hover:text-ink-soft"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password?.message ? (
                <p className="text-[12px] text-danger-500">{errors.password.message}</p>
              ) : null}
            </div>

            <div className="-mt-1 flex justify-end">
              <button
                type="button"
                onClick={openForgotPassword}
                className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
              Sign in
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink-faint">
              <ShieldCheck size={14} /> Quick demo access
            </div>
            <p className="mt-1.5 text-[12px] text-ink-faint">
              Tap a role to autofill credentials, then sign in.
            </p>
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

          <p className="mt-6 text-center text-[12px] text-ink-faint">
            New employee? <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">Create an account</Link>
          </p>
          <p className="mt-4 text-center text-[12px] text-ink-faint">
            <Link to="/" className="hover:text-ink-soft">← Back to homepage</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
