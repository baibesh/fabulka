import { cx } from "../ui/cx";
import { Skeleton } from "../ui/skeleton";

/** Where a price goes while the owner's prices load, so a stale price never flashes. */
export function PriceSkeleton({ className = "w-14" }: { className?: string }) {
  return <Skeleton data-testid="price-loading" radius="full" tone="current" className={cx("inline-block h-[1em] align-middle", className)} />;
}
