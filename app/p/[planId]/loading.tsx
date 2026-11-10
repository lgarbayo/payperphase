/** OWNED BY WP-06. Skeleton while the server builds the plan view. Mirrors the page layout. */
export default function PlanLoading() {
  const block = "animate-pulse rounded-[var(--ppp-radius)] bg-surface-2";
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando tu plan… / Loading your plan…
      </span>
      <div className="flex flex-col gap-2">
        <div className={`${block} h-4 w-56`} />
        <div className={`${block} h-8 w-80`} />
        <div className={`${block} h-4 w-96 max-w-full`} />
      </div>
      <div className={`${block} h-[470px]`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-64`} />
        ))}
      </div>
    </div>
  );
}
