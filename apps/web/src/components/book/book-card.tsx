import { LocaleLink } from "@/i18n/routing";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../ui/cx";

/** The lifting card a book is shown in on the site; for a card without a cover, as for «своя история». */
export const bookCardClass =
  "group flex h-full flex-col overflow-hidden border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-lg";

/**
 * A book as a link card: its square picture (a catalog cover fills it, a generated hero sits on
 * white), then whatever the page puts under it. Used by the catalog and the examples.
 */
export function BookCard({
  image,
  fit = "cover",
  radius = "lg",
  className,
  children,
  ...rest
}: ComponentProps<typeof LocaleLink> & { image: string | null | undefined; fit?: "cover" | "contain"; radius?: "md" | "lg"; children: ReactNode }) {
  return (
    <LocaleLink className={cx(bookCardClass, radius === "lg" ? "rounded-3xl" : "rounded-2xl", className)} {...rest}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are static files and generated pictures of any size
        <img
          src={image}
          alt=""
          className={cx("aspect-square w-full transition duration-500 group-hover:scale-105", fit === "cover" ? "object-cover" : "bg-white object-contain")}
        />
      ) : (
        <div className="aspect-square w-full bg-border" />
      )}
      {children}
    </LocaleLink>
  );
}
