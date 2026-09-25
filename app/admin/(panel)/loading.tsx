// Skeleton shown while an admin page streams in. Motion is skipped for users
// who ask for reduced motion.
export default function PanelLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-5xl">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-8 grid gap-4 s640:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
