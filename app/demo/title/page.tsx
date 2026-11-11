/** OWNED BY WP-14. Beat 1–2 cards: hook (2020 + dsca.gob.es text) then the title card. ?step=0|1|2. */
import { HookTitleCards } from "@/components/director/Cards";

export const metadata = { title: "PayPerPhase · Title" };

export default async function TitleCardsPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  const n = Number(step);
  return <HookTitleCards initialStep={Number.isInteger(n) ? n : 0} />;
}
