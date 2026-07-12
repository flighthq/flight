import type { MarkupClassResolver, MarkupTagRegistry, TextFormat } from '@flighthq/types';

/**
 * Opts a registry's `<span class>` styling into a caller-provided class → format map — the Tier-1
 * class-styling path over the standard dialect. `registerStandardMarkupTags` leaves the `classResolver`
 * seam unset, so a bare `<span class="warn">…</span>` contributes nothing; calling this installs a
 * resolver that looks each class name up in `styles` (returning null for unknown names), so the span
 * then contributes `styles.warn`. A `class` naming several space-separated classes merges their formats
 * left to right. Class names match exactly — CSS classes are case-sensitive.
 *
 * The map is the caller's own, so this carries no built-in style table: its weight is only ever what the
 * caller registers, and a bundle that never calls this keeps `<span>` a no-op grouping element. It is a
 * distinct export rather than a flag on `registerStandardMarkupTags` for the same reason as
 * `registerMarkupNamedColors` — the opt-in boundary is what keeps the feature off a bundle that does not
 * use it. Last-write-wins over any previously installed class resolver.
 */
export function registerMarkupClassStyles(
  registry: MarkupTagRegistry,
  styles: Readonly<Record<string, Readonly<Partial<TextFormat>>>>,
): void {
  const resolver: MarkupClassResolver = (className: string) => styles[className] ?? null;
  registry.classResolver = resolver;
}
