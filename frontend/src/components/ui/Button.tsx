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
  primary: "bg-brand-500 text-white shadow-soft hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300",
  secondary: "bg-ink text-white hover:bg-ink/90 active:bg-ink/80",
  outline: "border border-line bg-white text-ink hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50",
  ghost: "text-ink-soft hover:bg-black/5 hover:text-ink",
  danger: "bg-danger-500 text-white hover:bg-danger-700",
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, leftIcon, rightIcon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cx(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60",
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className
        )}
        {...props}
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
