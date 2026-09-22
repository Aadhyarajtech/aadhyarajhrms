import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/format";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[#5B4FE5] to-[#6D5BEA] text-white shadow-[0_8px_18px_rgba(91,79,229,0.22)] hover:from-[#5145D7] hover:to-[#634FD9] active:from-[#463CC4] active:to-[#5644C9] disabled:from-[#A9A4EA] disabled:to-[#B5B0ED]",

  secondary:
    "bg-slate-900 text-white shadow-[0_7px_16px_rgba(15,23,42,0.16)] hover:bg-slate-800 active:bg-slate-950",

  outline:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-300 hover:bg-[#F7F5FF] hover:text-brand-700",

  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900",

  danger:
    "bg-gradient-to-r from-[#D14343] to-[#E05252] text-white shadow-[0_7px_16px_rgba(209,67,67,0.18)] hover:from-[#BE3939] hover:to-[#D44747]",
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cx(
          "inline-flex items-center justify-center rounded-xl font-semibold tracking-[-0.01em] transition-all duration-150 ease-out",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "active:scale-[0.98]",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        {...props}
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : leftIcon}

        {children}

        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = "Button";