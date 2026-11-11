/** OWNED BY WP-14. Closing card: compliance + tagline + hosted URL. */
import { ClosingCard } from "@/components/director/Cards";
import { serverEnv } from "@/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "PayPerPhase · Closing" };

export default function ClosingPage() {
  return <ClosingCard url={serverEnv().PUBLIC_BASE_URL} />;
}
