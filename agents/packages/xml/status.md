---
package: "@flighthq/xml"
updated: 2026-07-30
by: builder3
---

# xml — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-30 — builder3 stale-cell audit and parser hardening

Audited the partial-45 TODO against the live tree and history:

- The quoted-attribute fix, initial internal-subset stripping, tree-building package description, and
  four query helpers already landed in `69fd6414f`.
- `XmlElement` already moved to `@flighthq/types` in `21f6a1a18`.
- Ordered mixed content and decoded text nodes already landed in the later SVG parser work.

The original DOCTYPE expression still ended early on `]` or `>` inside quoted DTD literals.
`f8c479d03` replaces it with a quote-aware, subset-depth scanner and covers internal entity values and
external identifiers. `2cf87d1b8` fixes the neighboring CDATA path so markup and comment syntax remain
literal ordered text instead of being parsed or deleted. `fabcc6c9d` preserves out-of-range numeric
references instead of throwing from `String.fromCodePoint`.

Scoped verification before the records refresh: `npm run check -- xml` passed; the XML workspace passed
2 files / 39 tests. The live review and assessment replace the obsolete partial-45 record without
authoring the still-undirected charter.
