---
package: '@flighthq/xml'
status: partial
score: 45
updated: 2026-07-09
ingested:
  - source
  - tests
---

# xml — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/xml.md)._

**Domain:** XML parsing — turning XML text into a traversable document model (and, in an authoritative library, serializing back, streaming, and validating).

**Verdict:** partial — completeness 35/100

The package exports two functions, `parseXmlDocument(xml): XmlElement | null` and `parseXmlAttributes(attrs): Record<string, string>`, recently extracted from `textureatlas-formats` so that `spritesheet-formats` and `textureatlas-formats` share one parser. The header comment is honest: "Not a general-purpose XML parser, but handles…" — and what it handles is a well-chosen subset for atlas/plist files: both quote styles, named + decimal + hex entity references, comments, CDATA, the XML declaration, and DOCTYPE stripping, all with sentinel returns and no throws. The tension is the name: `@flighthq/xml` claims the whole domain the way `@flighthq/math` does, and against fast-xml-parser, sax/saxes, or libxml the package covers roughly a third of it. Whether that is a gap or a deliberate ceiling is the package's one real design question.

## Present capabilities

- `parseXmlDocument(xml): XmlElement | null` — recursive-descent parse into `{ name, attributes, children, text }`. Handles nested elements, self-closing tags, text content (trimmed, concatenated), strips comments/CDATA-markers/declaration/DOCTYPE up front, skips processing instructions, tolerates unbalanced close tags and returns the first top-level element. `null` sentinel for no-element input — matches the SDK's expected-failure rule.
- `parseXmlAttributes(attrs): Record<string, string>` — regex scan supporting `"…"` and `'…'` values, names with `:`/`.`/`-`/`_` (so namespaced attributes like `xml:lang` at least survive as flat keys), entity decoding on values.
- `XmlElement` interface with doc comments stating the lossy choices (text/comments discarded as children; text trimmed and concatenated).
- Tests are genuinely good for the scope: 21 cases covering both quote styles, all five named entities, numeric refs, self-closing leaves, deep nesting, unbalanced close tags, multiple roots, exotic name characters, comment/declaration stripping, and text content.

## Gaps vs an authoritative XML library

Compare fast-xml-parser, saxes, and DOM `XMLParser`. Missing capabilities an expert would look for:

- **Serialization** — no `serializeXmlDocument`/builder direction at all. Every other `*-formats` consumer that wants to *write* an atlas or plist must hand-concatenate strings. fast-xml-parser ships `XMLBuilder` as a peer of the parser; this is the largest structural gap.
- **Mixed content and node order** — text is trimmed, concatenated into one `text` string, and comments/text are not children, so `<p>a<b/>c</p>` loses the a/b/c ordering entirely. Fine for attribute-shaped formats, fatal for document-shaped XML.
- **Attribute values containing `>`** — the opening-tag scan (`while … src[pos] !== '>'`) stops at the first `>`, even inside a quoted attribute value, so `<a title="x > y"/>` mis-parses. This is a correctness bug within the *claimed* subset (entities aside, `>` is legal in attribute values).
- **Error reporting** — no position/line information, no distinction between "no element" and "malformed"; unclosed tags silently consume to end-of-input. An authoritative parser offers at least an optional validating mode (fast-xml-parser's `XMLValidator`).
- **Namespaces** — prefixes are kept as literal name characters; no prefix/local-name split, no `xmlns` resolution.
- **Streaming / SAX tier** — no event/pull API for large documents; the "pull-style" phrase in the package description is inaccurate (see naming notes).
- **Processing instructions and comments as data** — both are discarded with no opt-in to preserve them.
- **DOCTYPE internal subsets and DTD entities** — `<!DOCTYPE …>` stripping uses `[^>]*`, so an internal subset (`<!DOCTYPE r [ <!ENTITY … > ]>`) breaks the strip; custom entities are (reasonably) unsupported but the DOCTYPE containing them should still be skipped correctly.
- **Query helpers** — no `getXmlElementChildByName`, `getXmlElementChildrenByName`, or attribute accessors with defaults; each consumer re-implements child filtering. For a shared parser feeding two formats packages, a small query layer is the natural next primitive.
- **Whitespace/entity options** — no trim opt-out, no raw-text access, no attribute-name transformation options.

Not counted against it: DTD validation, XPath, and XSD — out of scope even for most authoritative JS parsers.

## Naming / API-shape notes

- `parseXmlDocument`/`parseXmlAttributes` carry the full `Xml` type word and are globally self-identifying — correct per the naming rule. A future serializer should pair as `serializeXmlDocument` (matching `bitmapFilterSerialization`'s verb choice in `filters`).
- The package description says "pull-style XML parser," but the API is a one-shot tree parser (DOM-style); nothing is pulled. Fix the description (or, if a streaming tier is ever added, reserve "pull" for it).
- `XmlElement` is defined in `xmlParse.ts` but crosses package boundaries (consumed by `textureatlas-formats` and `spritesheet-formats`), so per the header-layer rule it belongs in `@flighthq/types`. Counter-consideration: `types-layout` treats `@flighthq/types` as the SDK's design surface, and a support-utility wire type may be intentionally beneath it — but then the rule needs that carve-out stated somewhere.
- `parseXmlDocument` returning only the first top-level element is a reasonable sentinel-friendly simplification, but the name says *document*; a document has exactly one root plus prolog/misc. Either enforce/document single-root or consider `parseXmlElement` as the honest name for "first element found."
- Honest-naming verdict on the package name: `@flighthq/xml` is defensible **only** if the intended ceiling is written down (a charter stating "attribute-shaped config XML, parse-only"). Otherwise the name over-promises the same way `math` did, and the alternatives are to grow toward the name or rename to the true scope.

## Recommendation

Decide the ceiling first; the code follows either way. If the intent is a minimal internal parser for atlas/plist formats, say so in the package description and charter, fix the two in-subset defects (`>` inside quoted attribute values; DOCTYPE internal-subset stripping), correct the "pull-style" description, and add the small query-helper layer (`getXmlElementChildByName` etc.) so consumers stop re-filtering `children` — that yields an honest, solid-for-its-scope utility. If the name is to be kept at face value, the growth path is: serializer (`serializeXmlDocument`), ordered mixed-content mode (opt-in child text nodes), positioned error reporting/validator, then namespace awareness — streaming can stay out of scope. Either way, move `XmlElement` to `@flighthq/types` or record the carve-out, since two format packages already depend on its shape.

## 2026-07-09 — refreshed

fixed >-in-quoted-attribute and DOCTYPE internal-subset parsing bugs; added element query helpers (getXmlElementChildByName/ChildrenByName/Attribute/AttributeNumber) (commit d1d2cd57). Verified against source; a full re-review is due.
