
import {
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Check, X } from "lucide-react";

import { AuthApi } from "@/lib/endpoints";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

type PasswordField = "current" | "new" | "confirm";

function getPasswordStrength(password: string) {
  if (!password) {
    return { score: 0, label: "", color: "bg-gray-200" };
  }

  const checks = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];

  const score = checks.filter(Boolean).length;

  if (score <= 2) {
    return { score, label: "Weak", color: "bg-red-500" };
  }
  if (score === 3) {
    return { score, label: "Fair", color: "bg-orange-500" };
  }
  if (score === 4) {
    return { score, label: "Good", color: "bg-yellow-500" };
  }

  return { score, label: "Strong", color: "bg-green-600" };
}

export default function TemporaryPasswordChange() {
  const navigate = useNavigate();
  const { user, isLoading, refreshUser, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });

  const strength = getPasswordStrength(newPassword);

  const requirements = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "At least 12 characters (recommended)", met: newPassword.length >= 12 },
    { label: "Uppercase and lowercase letters", met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
    { label: "At least one number", met: /\d/.test(newPassword) },
    { label: "At least one special character", met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  function toggleVisibility(field: PasswordField) {
    setVisibleFields((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please complete all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("Your new password must be different from the temporary password.");
      return;
    }

    try {
      setSubmitting(true);

      await AuthApi.changePassword(currentPassword, newPassword);
      await refreshUser();

      setSuccess("Password changed successfully.");
      navigate("/app/dashboard", { replace: true });
    } catch (err: unknown) {
      const apiError = err as {
        response?: {
          data?: {
            error?: { message?: string };
            message?: string;
          };
        };
        message?: string;
      };

      const message =
        apiError?.response?.data?.error?.message ||
        apiError?.response?.data?.message ||
        apiError?.message ||
        "Unable to change password. Please try again.";

      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <p>Please sign in to change your password.</p>
        <Button onClick={() => navigate("/login", { replace: true })}>
          Go to Login
        </Button>
      </div>
    );
  }

  if (!user.mustResetPwd) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Button onClick={() => navigate("/app/dashboard", { replace: true })}>
          Continue to Dashboard
        </Button>
      </div>
    );
  }

  const passwordInput = (
    field: PasswordField,
    label: string,
    value: string,
    setter: (value: string) => void,
    autoComplete: string,
    minLength?: number
  ) => {
    const id = `${field}Password`;

    return (
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>

        <div className="relative">
          <input
            id={id}
            type={visibleFields[field] ? "text" : "password"}
            autoComplete={autoComplete}
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setter(event.target.value)
            }
            required
            minLength={minLength}
            disabled={submitting}
            className="w-full rounded-md border px-3 py-2 pr-11 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
          />

          <button
            type="button"
            aria-label={visibleFields[field] ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={visibleFields[field]}
            onClick={() => toggleVisibility(field)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-muted hover:text-ink"
          >
            {visibleFields[field] ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-brand-50 p-3">
            <LockKeyhole className="h-6 w-6 text-brand-600" />
          </div>

          <h1 className="text-xl font-semibold text-ink">
            Change Temporary Password
          </h1>

          <p className="mt-2 text-sm text-ink-muted">
            Set a new password before continuing to Aadhyaraj HRMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {passwordInput(
            "current",
            "Temporary / Current Password",
            currentPassword,
            setCurrentPassword,
            "current-password"
          )}

          {passwordInput(
            "new",
            "New Password",
            newPassword,
            setNewPassword,
            "new-password",
            8
          )}

          {newPassword && (
            <div className="space-y-3 rounded-lg border bg-gray-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Password strength</span>
                <span
                  className={
                    strength.score <= 2
                      ? "font-semibold text-red-600"
                      : strength.score === 3
                        ? "font-semibold text-orange-600"
                        : strength.score === 4
                          ? "font-semibold text-yellow-700"
                          : "font-semibold text-green-700"
                  }
                >
                  {strength.label}
                </span>
              </div>

              <div
                className="flex gap-1"
                role="progressbar"
                aria-label={`Password strength: ${strength.label}`}
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={strength.score}
              >
                {[1, 2, 3, 4, 5].map((segment) => (
                  <div
                    key={segment}
                    className={`h-1.5 flex-1 rounded-full ${
                      segment <= strength.score
                        ? strength.color
                        : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>

              <div className="space-y-2">
                {requirements.map((requirement) => (
                  <div
                    key={requirement.label}
                    className="flex items-center gap-2 text-xs"
                  >
                    {requirement.met ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span
                      className={
                        requirement.met ? "text-green-700" : "text-ink-muted"
                      }
                    >
                      {requirement.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {passwordInput(
            "confirm",
            "Confirm New Password",
            confirmPassword,
            setConfirmPassword,
            "new-password",
            8
          )}

          {confirmPassword && (
            <p
              className={`text-xs ${
                confirmPassword === newPassword
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {confirmPassword === newPassword
                ? "Passwords match."
                : "Passwords do not match."}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            >
              {success}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? "Updating..." : "Change Password"}
          </Button>
        </form>

        <button
          type="button"
          disabled={submitting}
          className="mt-5 w-full text-sm text-ink-muted hover:text-ink disabled:opacity-50"
          onClick={logout}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
