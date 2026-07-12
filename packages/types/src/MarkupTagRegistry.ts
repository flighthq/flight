import type { MarkupTagHandler } from './MarkupTagHandler';

// The open tag-name → handler registry that gives markup its meaning. Parsing (structure) and meaning
// (tag → format) are separate layers: the parser tokenizes and composes the format stack, while this
// registry decides what each tag contributes. The registered set of tag names IS the supported
// dialect. Open and last-write-wins — a user registers their own (vendor-prefixed) tags, and unused
// standard tags tree-shake out when a custom registry is built instead of the standard one.
export interface MarkupTagRegistry {
  handlers: Map<string, MarkupTagHandler>;
}
