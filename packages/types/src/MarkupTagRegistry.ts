import type { MarkupColorResolver } from './MarkupColorResolver';
import type { MarkupTagHandler } from './MarkupTagHandler';

// The open tag-name → handler registry that gives markup its meaning. Parsing (structure) and meaning
// (tag → format) are separate layers: the parser tokenizes and composes the format stack, while this
// registry decides what each tag contributes. The registered set of tag names IS the supported
// dialect. Open and last-write-wins — a user registers their own (vendor-prefixed) tags, and unused
// standard tags tree-shake out when a custom registry is built instead of the standard one.
export interface MarkupTagRegistry {
  // The color seam the `<font>` handler consults. `registerStandardMarkupTags` installs a hex-only
  // resolver; `registerMarkupNamedColors` swaps in one that also resolves CSS named colors. Left unset
  // on a bare registry, in which case the standard `<font>` handler falls back to hex-only parsing. This
  // is what keeps the named-color table out of a bundle that never opts into it — see MarkupColorResolver.
  colorResolver?: MarkupColorResolver;
  handlers: Map<string, MarkupTagHandler>;
}
