// path: src/components/reports/AiChatDrawer.tsx
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles } from "lucide-react";
import { AskHrDataView } from "./AskHrDataView";

interface AiChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters?: {
    from?: string;
    to?: string;
    departmentId?: string;
  };
  initialQuery?: string;
}

export function AiChatDrawer({
  isOpen,
  onClose,
  filters,
  initialQuery,
}: AiChatDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl border-l border-line animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-xs">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">
                  HR AI Chat Assistant
                </span>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                  Natural Language
                </span>
              </div>
              <p className="text-[11px] text-ink-soft">
                Ask anything about attendance, headcount, payroll, or tickets
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100 hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body housing the conversational Chat View */}
        <div className="flex-1 overflow-hidden p-4">
          <AskHrDataView
            filters={filters}
            initialQuery={initialQuery}
            isDrawer={true}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
