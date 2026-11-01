/** Class names joined, the false and empty ones dropped: cx("a", on && "b", undefined) → "a b". */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(" ");
}

type VariantMap = Record<string, Record<string, string>>;

/** The props a `variants()` recipe takes: one optional key per variant. */
export type VariantProps<V extends VariantMap> = { [K in keyof V]?: keyof V[K] };

/**
 * A tiny class recipe: a base, named variants and their defaults. Size and colour come through these
 * props; a `className` passed in is for layout (margins, width, self-alignment) and goes last.
 *
 *   const badge = variants({ base: "rounded-full", variants: { tone: { muted: "bg-border" } }, defaults: { tone: "muted" } });
 *   badge({ tone: "muted", className: "ml-2" })
 */
export function variants<V extends VariantMap>({
  base,
  variants: map,
  defaults,
}: {
  base?: string;
  variants: V;
  defaults: { [K in keyof V]: keyof V[K] };
}) {
  return (props: VariantProps<V> & { className?: string } = {}) =>
    cx(base, ...Object.keys(map).map((key) => map[key][String(props[key] ?? defaults[key])]), props.className);
}
