import { Globe } from "lucide-react";

/**
 * A country's flag as an SVG (flag-icons), so it shows on Windows too, where flag emoji do not.
 * Anything but an ISO code ("other") gets a globe.
 */
export function Flag({ code, className = "" }: { code: string; className?: string }) {
  if (!/^[A-Z]{2}$/.test(code)) return <Globe aria-hidden className={`size-[1em] shrink-0 text-muted ${className}`} />;
  return <span aria-hidden className={`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.1)] ${className}`} />;
}
