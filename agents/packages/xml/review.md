---
package: '@flighthq/xml'
status: solid
score: 74
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types
  - prior review (2026-07-09 refresh)
---

# xml — Review

## Verdict

**Solid for its described lightweight scope — 74/100.** The prior partial-45 review is stale against
the live package. Quoted `>` characters, ordinary internal DOCTYPE subsets, the tree-building package
description, and four element-query helpers all landed in the July implementation. `XmlElement` now
lives in `@flighthq/types`, and later SVG work added ordered mixed content. The package is a coherent
one-shot tree parser for Flight's XML-backed formats; the score remains bounded because its charter has
never settled whether that deliberately narrow ceiling is durable or the broad `xml` name promises a
serializer, validation, and namespace-aware growth.

## Present capabilities

- Six public functions cover document and attribute parsing plus string/number attribute lookup and
  first/all direct-child lookup. All implementation exports are public and have colocated coverage.
- `parseXmlDocument` builds an `XmlElement` tree with both element-only `children` and source-ordered
  mixed `content`. The `text` projection concatenates trimmed direct-text nodes for data-oriented
  consumers.
- Opening tags accept single- and double-quoted attributes, `>` inside either quote style, self-closing
  elements, namespaced or punctuation-bearing names, and the five predefined plus numeric entity
  references.
- Prolog processing removes XML declarations, processing instructions, comments, and DOCTYPE declarations.
  CDATA contributes literal ordered text without treating its markup-like contents as elements.
- `XmlElement` lives in `@flighthq/types`; package consumers use the contract lane, the package is
  import-side-effect-free, and the XML workspace has two source modules and 39 tests.

## Stale-cell audit and live fixes

The four Recommended items were already substantially complete:

- `69fd6414f` made opening-tag scanning quote-aware, handled ordinary internal DOCTYPE subsets, replaced
  the inaccurate "pull-style" package description with the tree-building model, and added
  `getXmlElementAttribute`, `getXmlElementAttributeNumber`, `getXmlElementChildByName`, and
  `getXmlElementChildrenByName`.
- `21f6a1a18` moved `XmlElement` into the header package, resolving the old cross-package type-home concern.
- `d6d5b4c9a` and `a49c5dad4` added ordered mixed content and entity decoding for text nodes.

The audit found that the DOCTYPE fix still relied on a non-quote-aware regular expression. A `]` inside
an entity value ended its internal-subset match early, while a `>` inside a quoted external identifier
ended a flat declaration early; both cases caused the document parser to return `null`. `f8c479d03`
replaces the expression with a quote-aware, subset-depth scanner and covers both cases.

Two adjacent claimed-capability defects were also live. CDATA preprocessing injected its payload back
into the markup stream, turning literal `<tag>` text into a child and deleting comment syntax inside the
section; `2cf87d1b8` parses CDATA in place as raw ordered text. Out-of-range numeric references reached
`String.fromCodePoint` and threw instead of preserving an unsupported reference; `fabcc6c9d` restores
the package's sentinel-friendly behavior.

## Remaining depth

- Structural parsing is deliberately tolerant: it does not match opening and closing names, reject
  multiple roots, or report malformed-input positions. Callers cannot distinguish no root from a
  malformed document.
- Namespace prefixes survive lexically, but namespace declarations are not resolved and callers cannot
  query local name or namespace URI.
- DTD declarations are skipped and custom entities are not expanded. This is appropriate for the
  lightweight format-reader scope but must remain explicit if the charter blesses that ceiling.
- `content` preserves mixed order, while the convenience `text` projection trims each direct text node
  before concatenation. Consumers needing exact whitespace must use `content`.
- There is no serializer/builder, streaming event tier, schema/DTD validation, XPath-style traversal, or
  structured parse diagnostic. Whether the first four belong here is a direction decision, not a
  sweep-safe implementation task.
- Existing format consumers have not consistently adopted the query helpers and still contain local
  child/attribute filtering. Migration is optional cross-package cleanup; it does not change the XML API.

## Charter and boundary conclusion

No named direction has settled the scope fork. The package description truthfully presents a lightweight
tree-building parser, and the shipped implementation is solid within that boundary, but the charter
remains a scaffold. A direction session should either bless parse-only, data-oriented XML as the durable
ceiling or choose the staged full-library path. Until then, serializer, validation, namespaces, and
streaming stay backlog rather than inferred work.
