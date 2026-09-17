import { cx } from "@/lib/format";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: TabsProps) {
  return (
    <div
      className={cx(
        "flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-slate-100/70 p-1 shadow-inner",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cx(
              "relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all",
              isActive
                ? "bg-white text-brand-700 shadow-[0_5px_14px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-800",
            )}
          >
            {tab.label}

            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cx(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  isActive
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}