export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-full border-2 border-neutral-600 border-t-amber-500 animate-spin ${className}`}
    />
  );
}
