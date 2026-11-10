"use client";
/**
 * OWNED BY WP-08. FDI odontogram (SVG) with per-tooth treatment marks and staggered reveal.
 * SCAFFOLD STUB: simple tooth-number grid.
 */
import type { FdiTooth, Locale, ProcedureCategory } from "@/contracts";
import { PERMANENT_TEETH } from "@/contracts";
import { cx } from "@/lib/ui";

export interface ToothMark {
  tooth: FdiTooth;
  category: ProcedureCategory;
  /** Phase number the treatment belongs to, if planned. */
  phaseN?: number;
  state: "planned" | "done" | "missing" | "extract";
}

export interface OdontogramProps {
  marks: ToothMark[];
  /** Teeth to pulse right now (e.g. the line being extracted). */
  highlight?: FdiTooth[];
  /** Stagger reveal of marks in this order (ms between teeth). 0 = no animation. */
  revealStaggerMs?: number;
  locale: Locale;
  size?: "sm" | "md" | "lg";
}

export function Odontogram({ marks, highlight = [] }: OdontogramProps) {
  const marked = new Set(marks.map((m) => m.tooth));
  return (
    <div data-testid="odontogram" className="grid grid-cols-16 gap-1 text-[10px]">
      {PERMANENT_TEETH.map((t) => (
        <div
          key={t}
          data-tooth={t}
          className={cx(
            "rounded border border-border px-1 py-0.5 text-center",
            marked.has(t) && "bg-primary/15",
            highlight.includes(t) && "ring-2 ring-primary",
          )}
        >
          {t}
        </div>
      ))}
    </div>
  );
}
