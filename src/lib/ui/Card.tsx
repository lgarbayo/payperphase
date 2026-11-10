import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-[var(--ppp-radius)] border border-border bg-surface p-5 shadow-[var(--ppp-shadow)]", className)}
      {...props}
    />
  );
}
