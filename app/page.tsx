/**
 * OWNED BY WP-14. Story landing page. SCAFFOLD STUB.
 */
import Link from "next/link";
import { TrustStrip } from "@/components/brand/TrustStrip";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-10">
      <h1 className="text-4xl font-semibold tracking-tight">PayPerPhase</h1>
      <p className="text-lg text-muted">Paga tu tratamiento dental fase a fase, cuando lo recibes. Nunca por adelantado.</p>
      <TrustStrip locale="es" />
      <nav className="flex gap-4 text-primary-strong underline">
        <Link href="/clinic">Clínica</Link>
        <Link href="/p/demo">Paciente</Link>
        <Link href="/demo">Demo</Link>
      </nav>
    </main>
  );
}
