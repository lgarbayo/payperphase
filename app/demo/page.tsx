/**
 * OWNED BY WP-14. Director Mode hub (/demo?director=1). SCAFFOLD STUB.
 */
import { DirectorMode } from "@/components/director/DirectorMode";

export default function DemoPage() {
  return (
    <main className="p-10">
      <h1 className="text-2xl font-semibold">Demo</h1>
      <DirectorMode />
    </main>
  );
}
