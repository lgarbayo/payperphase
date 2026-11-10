/**
 * OWNED BY WP-04. Hour-1 spike page (/spike-paylater): JS SDK v5 with buyer-country=ES, EUR,
 * enable-funding=paylater, under intent=capture AND intent=authorize, rendering the official Pay Later
 * message for €360 / €1,500 / €1,950 and a button. Result → docs/spikes/paylater-es.md.
 *
 * ?client-id=… overrides the configured sandbox client id (e.g. `sb`, PayPal's public sandbox
 * placeholder, when no credentials are configured).
 */
import { paypalClientConfig } from "@/lib/paypal";
import { SpikeClient } from "./SpikeClient";

export const dynamic = "force-dynamic";

export default async function SpikePayLaterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const fromQuery = typeof sp["client-id"] === "string" ? sp["client-id"] : undefined;
  const cfg = paypalClientConfig();
  const clientId = fromQuery ?? cfg.clientId ?? "sb";
  const source = fromQuery ? "query" : cfg.clientId ? "env" : "placeholder";
  return <SpikeClient clientId={clientId} source={source} buyerCountry={cfg.buyerCountry ?? "ES"} />;
}
