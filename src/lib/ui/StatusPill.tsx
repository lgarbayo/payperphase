import type { Locale } from "@/contracts/primitives";
import type { PaymentStatus } from "@/contracts/plan";
import { Badge } from "./Badge";
import { STATUS_LABEL } from "./status";

export function StatusPill({ status, locale }: { status: PaymentStatus; locale: Locale }) {
  return (
    <Badge tone={status} data-status={status}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status][locale]}
    </Badge>
  );
}
