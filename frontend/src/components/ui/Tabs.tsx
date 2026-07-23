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

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cx("flex items-center gap-1 rounded-2xl bg-ink/5 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cx(
            "relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all",
            active === tab.key ? "bg-white text-ink shadow-soft" : "text-ink-faint hover:text-ink-soft"
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className={cx("rounded-full px-1.5 py-0.5 text-[11px]", active === tab.key ? "bg-brand-100 text-brand-700" : "bg-ink/10 text-ink-faint")}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
