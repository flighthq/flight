import type { TextFormat } from './TextFormat';

// Resolves a single `<span class>` token to the TextFormat fields that class contributes, or null when
// the class is unknown. The style seam a `MarkupTagRegistry` carries and the standard `<span>` handler
// consults: the standard dialect leaves it unset (a bare `<span>` is a transparent grouping element),
// and `registerMarkupClassStyles` installs one over a caller-provided class → format map. Keeping class
// styling behind this seam is what keeps a style table out of a bundle that never opts in — the map is
// the caller's own, never a built-in table, so span costs nothing until styles are registered.
export type MarkupClassResolver = (className: string) => Readonly<Partial<TextFormat>> | null;
