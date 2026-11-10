import type { HTMLAttributes } from "react";
import { cx } from "./cx";

type Tone = "neutral" | "primary" | "scheduled" | "upcoming" | "due" | "processing" | "paid" | "overdue";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary/10 text-primary-strong",
  scheduled: "bg-status-scheduled/15 text-ink",
  upcoming: "bg-status-upcoming/15 text-status-upcoming",
  due: "bg-status-due/15 text-status-due",
  processing: "bg-status-processing/15 text-status-processing",
  paid: "bg-status-paid/15 text-status-paid",
  overdue: "bg-status-overdue/15 text-status-overdue",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
