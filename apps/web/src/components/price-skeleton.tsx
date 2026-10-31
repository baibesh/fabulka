/** Where a price goes while the owner's prices load, so a stale price never flashes. */
export function PriceSkeleton({ className = "w-14" }: { className?: string }) {
  return <span aria-hidden data-testid="price-loading" className={`inline-block h-[1em] animate-pulse rounded-full bg-current/15 align-middle ${className}`} />;
}
