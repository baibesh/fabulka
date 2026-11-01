/**
 * The Fabulka mark: a friendly open book with a face and a star above it (the "bookling"). It
 * opens, blinks and twinkles through CSS in globals.css (`.logo-*`), which stops all of it for
 * visitors who prefer reduced motion. `animated={false}` draws it still.
 */
export function LogoMark({ className = "size-9", animated = true }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={`shrink-0 overflow-visible ${animated ? "logo-animated" : ""} ${className}`}>
      <rect width="48" height="48" rx="13" fill="#e8833a" />
      <g className="logo-book">
        <path d="M24 41c-5.6-3.6-12.6-4.4-19.5-2.6V22h39v16.4c-6.9-1.8-13.9-1-19.5 2.6z" fill="#c4611f" />
        <path className="logo-page-left" d="M24 39c-5.4-3.6-12.2-4.4-18.5-2.8V18.6c6.3-1.6 13.1-.8 18.5 2.8z" fill="#fffaf3" />
        <path className="logo-page-right" d="M24 39c5.4-3.6 12.2-4.4 18.5-2.8V18.6c-6.3-1.6-13.1-.8-18.5 2.8z" fill="#fde3c8" />
        <g className="logo-face">
          <ellipse cx="11.4" cy="31.4" rx="2.3" ry="1.4" fill="#f39a7b" />
          <ellipse cx="36.6" cy="31.4" rx="2.3" ry="1.4" fill="#f39a7b" />
          <g className="logo-eyes">
            <ellipse cx="15" cy="26.6" rx="2.2" ry="2.8" fill="#2b2118" />
            <ellipse cx="33" cy="26.6" rx="2.2" ry="2.8" fill="#2b2118" />
            <circle cx="15.8" cy="25.6" r=".75" fill="#fff" />
            <circle cx="33.8" cy="25.6" r=".75" fill="#fff" />
          </g>
          <path d="M20.6 30.4q3.4 3.6 6.8 0" fill="none" stroke="#2b2118" strokeWidth="1.9" strokeLinecap="round" />
        </g>
      </g>
      <path className="logo-star" d="M24 4.8l1.7 3.8 3.8 1.7-3.8 1.7-1.7 3.8-1.7-3.8-3.8-1.7 3.8-1.7z" fill="#ffe08a" />
    </svg>
  );
}

/** The mark and the wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-8 sm:size-9" />
      <span className="text-xl font-extrabold tracking-tight">Fabulka</span>
    </span>
  );
}
