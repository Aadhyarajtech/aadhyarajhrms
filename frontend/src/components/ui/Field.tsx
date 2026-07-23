import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/format";

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldWrapper({ label, error, hint, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-ink-soft">
          {label} {required && <span className="text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-[12px] text-danger-500">{error}</p> : hint ? <p className="text-[12px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

const fieldBase =
  "h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <input ref={ref} className={cx(fieldBase, error && "border-danger-500", className)} {...props} />
    </FieldWrapper>
  )
);
TextField.displayName = "TextField";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, required, className, children, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <select ref={ref} className={cx(fieldBase, "appearance-none bg-no-repeat pr-8", error && "border-danger-500", className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  )
);
SelectField.displayName = "SelectField";

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, error, hint, required, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <textarea ref={ref} className={cx(fieldBase, "min-h-[88px] py-2.5 resize-none", error && "border-danger-500", className)} {...props} />
    </FieldWrapper>
  )
);
TextareaField.displayName = "TextareaField";
