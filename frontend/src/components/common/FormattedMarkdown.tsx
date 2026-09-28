import { useMemo, type ReactNode } from "react";
import { cx } from "@/lib/format";

interface FormattedMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Render inline tokens: **bold**, __bold__, *italic*, _italic_, `code`
 */
function renderInline(text: string): ReactNode[] {
  if (!text) return [];

  const parts = text.split(
    /(\*\*[\s\S]*?\*\*|__[\s\S]*?__|\*[^\*\n]+?\*|_[^_\n]+?_|`[^`\n]+`)/g,
  );

  return parts.map((part, index) => {
    if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
    ) {
      return (
        <strong key={index} className="font-bold text-inherit">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
    ) {
      return (
        <em key={index} className="italic text-inherit">
          {renderInline(part.slice(1, -1))}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-[11px] text-inherit"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

/**
 * Lightweight, safe, and beautiful Markdown renderer for AI chat messages.
 * Handles headings (#, ##, ###), bold, italic, lists (bullet & numbered), blockquotes, code, and linebreaks.
 */
export function FormattedMarkdown({
  content,
  className = "",
}: FormattedMarkdownProps) {
  const elements = useMemo(() => {
    if (!content) return null;

    const rawLines = content.split(/\r?\n/);
    const nodes: ReactNode[] = [];

    let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

    const flushList = () => {
      if (!currentList) return;
      if (currentList.type === "ul") {
        nodes.push(
          <ul
            key={`ul-${nodes.length}`}
            className="my-1 space-y-1 pl-0.5 text-inherit"
          >
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
              </li>
            ))}
          </ul>,
        );
      } else {
        nodes.push(
          <ol
            key={`ol-${nodes.length}`}
            className="my-1 list-decimal list-inside space-y-1 pl-0.5 text-inherit"
          >
            {currentList.items.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </ol>,
        );
      }
      currentList = null;
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // Table block detection (| col1 | col2 | followed by |---|---|)
      if (
        trimmed.startsWith("|") &&
        i + 1 < rawLines.length &&
        /^\|?\s*[-:]+[-| :]*\|?$/.test(rawLines[i + 1].trim())
      ) {
        flushList();
        const parseRow = (rowStr: string) => {
          let s = rowStr.trim();
          if (s.startsWith("|")) s = s.slice(1);
          if (s.endsWith("|")) s = s.slice(0, -1);
          return s.split("|").map((c) => c.trim());
        };

        const headers = parseRow(trimmed);
        const separatorRow = parseRow(rawLines[i + 1].trim());
        const alignments = separatorRow.map((sep) => {
          const l = sep.startsWith(":");
          const r = sep.endsWith(":");
          if (l && r) return "text-center";
          if (r) return "text-right";
          return "text-left";
        });

        i += 2; // skip header and separator lines
        const bodyRows: string[][] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith("|")) {
          bodyRows.push(parseRow(rawLines[i]));
          i++;
        }
        i--; // compensate for loop's increment

        nodes.push(
          <div
            key={`table-${i}`}
            className="my-2.5 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/80 shadow-xs"
          >
            <table className="w-full text-left text-[11.5px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-800 font-semibold">
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className={cx(
                        "px-3 py-2 border-r border-slate-200/60 last:border-r-0 whitespace-nowrap",
                        alignments[hIdx] || "text-left",
                      )}
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-brand-50/40 transition-colors"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={cx(
                          "px-3 py-2 border-r border-slate-100 last:border-r-0 leading-relaxed",
                          alignments[cIdx] || "text-left",
                        )}
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // Heading 3 (### )
      if (trimmed.startsWith("### ")) {
        flushList();
        nodes.push(
          <h4
            key={`h3-${i}`}
            className="mt-2.5 mb-1 font-bold text-[13px] text-inherit"
          >
            {renderInline(trimmed.slice(4))}
          </h4>,
        );
        continue;
      }

      // Heading 2 (## )
      if (trimmed.startsWith("## ")) {
        flushList();
        nodes.push(
          <h3
            key={`h2-${i}`}
            className="mt-3 mb-1 font-bold text-[14px] text-inherit"
          >
            {renderInline(trimmed.slice(3))}
          </h3>,
        );
        continue;
      }

      // Heading 1 (# )
      if (trimmed.startsWith("# ")) {
        flushList();
        nodes.push(
          <h2
            key={`h1-${i}`}
            className="mt-3.5 mb-1 font-bold text-[15px] text-inherit"
          >
            {renderInline(trimmed.slice(2))}
          </h2>,
        );
        continue;
      }

      // Bullet item (•, -, *)
      const bulletMatch = trimmed.match(/^[•\-\*]\s+(.*)/);
      if (bulletMatch) {
        if (currentList && currentList.type !== "ul") {
          flushList();
        }
        if (!currentList) {
          currentList = { type: "ul", items: [] };
        }
        currentList.items.push(bulletMatch[1]);
        continue;
      }

      // Numbered item (1., 2., etc.)
      const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
      if (numMatch) {
        if (currentList && currentList.type !== "ol") {
          flushList();
        }
        if (!currentList) {
          currentList = { type: "ol", items: [] };
        }
        currentList.items.push(numMatch[2]);
        continue;
      }

      // Blockquote (> )
      if (trimmed.startsWith("> ")) {
        flushList();
        nodes.push(
          <blockquote
            key={`bq-${i}`}
            className="my-1.5 border-l-2 border-current/40 pl-2.5 italic opacity-90"
          >
            {renderInline(trimmed.slice(2))}
          </blockquote>,
        );
        continue;
      }

      // Regular paragraph line
      flushList();
      nodes.push(
        <p key={`p-${i}`} className="leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }

    flushList();
    return nodes;
  }, [content]);

  return <div className={cx("space-y-1 text-inherit", className)}>{elements}</div>;
}
