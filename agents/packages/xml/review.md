---
package: '@flighthq/xml'
status: solid
score: 75
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types
  - consumer packages
  - prior review (2026-07-30)
  - prior assessment (2026-07-30)
---

# xml — Review

## Verdict

**Solid within its deliberately narrow scope -- 75/100.** The package is a coherent one-shot tree
parser serving Flight's XML-backed format readers (texture atlases, tilemap formats, bitmap font
definitions, plist files, SVG import). Six exported functions span document parsing, attribute
parsing, and element querying. All exports are covered by colocated tests, `XmlElement` lives in
`@flighthq/types`, the two blessed export lanes are correct, the package is import-side-effect-free,
and every intra-SDK consumer imports through the `./contract` lane. The score is bounded by an
undirected charter -- the broad `xml` name suggests a full XML library, but the implementation is a
parse-only utility with no serializer, no namespace resolution, and no structured diagnostics. That
ceiling is defensible for a format-reader helper; it is not yet blessed as durable by the charter.

## Present capabilities

- **Six public functions**, identical across both export lanes (`index.ts` re-exports from
  `contract.ts`):
  - `parseXmlDocument` -- builds an `XmlElement` tree from an XML string, returning null when no
    element is found.
  - `parseXmlAttributes` -- parses an attribute string into a `Record<string, string>` with entity
    decoding.
  - `getXmlElementAttribute` -- returns a named attribute value or null.
  - `getXmlElementAttributeNumber` -- returns a named attribute parsed as a finite number, or null.
  - `getXmlElementChildByName` -- returns the first direct child matching a tag name, or null.
  - `getXmlElementChildrenByName` -- returns all direct children matching a tag name in document
    order.

- **Parsing features**: double- and single-quoted attribute values; `>` inside quoted attribute
  values treated as data; self-closing elements; namespaced and punctuation-bearing element/attribute
  names (`my-tag.v2`, `data_key`, `xml:lang`); the five predefined XML entities plus decimal and hex
  numeric character references; general entities declared in a DOCTYPE's internal subset (expanded
  into the source before tree-building); XML declaration and processing instruction stripping;
  comment stripping (CDATA-aware -- comments inside CDATA are literal text); DOCTYPE stripping with
  quote-aware internal-subset scanning; CDATA as literal ordered text.

- **Mixed content model**: `XmlElement` carries both element-only `children` and source-ordered
  `content` (interleaved text and element nodes). The convenience `text` projection concatenates
  trimmed direct text nodes for data-oriented consumers.

- **Safety bounds**: element nesting capped at 256 (`MAX_XML_ELEMENT_DEPTH`); entity expansion
  capped by both pass count (8) and budget (`src.length * 16 + 65536`). Both are sentinel-returning
  rather than throwing.

- **Type home**: `XmlElement` is an interface in `@flighthq/types`, exported through both its `.`
  and `./contract` lanes. The xml package imports it from `@flighthq/types/contract`.

- **Consumer adoption**: five format packages consume `@flighthq/xml/contract` --
  `tilemap-formats`, `bitmapfont-formats`, `spritesheet-formats`, `textureatlas-formats`, and
  `scene2d-formats`. The SDK barrel re-exports the full surface. `tilemap-formats` and
  `bitmapfont-formats` use all four query helpers extensively; `spritesheet-formats`,
  `textureatlas-formats`, and `scene2d-formats` import only `parseXmlDocument` and access attributes
  and children directly.

- **Test coverage**: two test files with 7 `describe` blocks and 50 test cases (including 3 from an
  `it.each` parameterized block). Coverage spans attribute parsing, entity decoding, document
  structure, self-closing tags, deep nesting, depth limits, mixed content, CDATA, comments, XML
  declarations, DOCTYPE stripping (including quoted-subset edge cases), general entity expansion
  (nested, self-referential, budget-capped), and the four query helpers.

- **Package manifest**: `sideEffects: false`, sole dependency is `@flighthq/types`, two export
  conditions (`.` and `./contract`) with types-first resolution. Description accurately presents the
  tree-building model.

## Gaps

- **No serializer.** There is no way to produce XML from an `XmlElement` tree. Consumers needing
  round-trip or XML generation have no path in this package.

- **No namespace resolution.** Prefixed names are kept verbatim (`svg:rect` is a distinct tag name
  from `rect`). There is no prefix-to-URI binding, no local-name extraction, and `xmlns` is treated
  as an ordinary attribute. The SVG importer in `scene2d-formats` works around this with its own
  `localName` helper (`svgDocument.ts:854`).

- **No structured parse diagnostics.** `parseXmlDocument` returns null for both "no element found"
  and "malformed input" -- callers cannot distinguish the two. Entity expansion budget exhaustion is
  silent with no `explain*` query. The diagnostics convention calls for an `explain*` function for
  every silent sentinel, but none exists here.

- **No well-formedness checking.** Opening and closing tag names are not matched; multiple root
  elements silently return only the first; attribute uniqueness is not enforced (last-write wins via
  `Record` assignment). This is intentional tolerance, not a defect, but it means the parser cannot
  validate input.

- **Uneven query-helper adoption by consumers.** `textureatlas-formats` and `spritesheet-formats`
  use `children.find()` and direct `.attributes[]` access instead of the query helpers. This is
  optional cross-package cleanup and does not affect the XML API itself, but it does mean those
  consumers bypass the null-returning sentinel contract the helpers provide.

- **Text-node whitespace is lossy by design.** The `text` projection trims each direct text node
  before concatenation. Consumers needing exact whitespace must use `content`. There is no mode to
  preserve original whitespace in `text`.

## Charter contradictions

The charter body is scaffold -- its North star, Boundaries, Decisions, and Open directions sections
are all empty or TODO. The `What it is` section, seeded from the prior review, describes the package
as "XML parsing -- turning XML text into a traversable document model (and, in an authoritative
library, serializing back, streaming, and validating)." The parenthetical implies a growth path the
implementation has not taken and no direction session has blessed. The package description in
`package.json` is internally consistent and accurately describes the lightweight tree-building
scope. The charter neither contradicts the implementation nor blesses its current ceiling.

## Contract & docs fit

- **Export lanes**: correct. `contract.ts` is the full surface; `index.ts` re-exports from it.
  Both lanes export the same six functions. All intra-SDK consumers import from `./contract`.
- **Type home**: `XmlElement` lives in `@flighthq/types` with no inline type exports in the xml
  package. Verified -- `grep` for `export interface|type|enum` in `packages/xml/src/` returns
  nothing.
- **sideEffects**: declared `false`; verified -- no module-level side effects in either source file.
- **Readonly usage**: query helpers accept `Readonly<XmlElement>` parameters. `expandXmlEntities`
  accepts `Readonly<Record<string, string>>` for its entity map.
- **Sentinel convention**: all query helpers return null for missing values. `parseXmlDocument`
  returns null for unparseable input. Out-of-range numeric references pass through as literal text
  rather than throwing.
- **Test colocations**: `xmlParse.test.ts` beside `xmlParse.ts`, `xmlQuery.test.ts` beside
  `xmlQuery.ts`. `describe` blocks are alphabetized and mirror exported names.
- **No TODO/FIXME in source**: verified.
- **status.md**: current as of 2026-08-08. All five Open items verified against source.

## Candidate open directions

1. **Charter direction session.** The foundational question: bless parse-only data-oriented XML as
   the durable ceiling (rename or accept the broad `xml` package name), or stage growth toward
   serializer, namespace resolution, positioned diagnostics, and optional streaming.

2. **`explain*` query for entity-expansion budget exhaustion.** The diagnostics convention requires
   a shakeable `explain*` function for every silent sentinel. Entity expansion that exhausts its
   budget currently keeps partial output with no caller-visible signal.

3. **`explain*` query for parse failure.** `parseXmlDocument` returning null for both "empty input"
   and "malformed document" violates the explain convention. An `explainXmlParseResult` returning
   structured data (no-element-found vs. depth-exceeded vs. malformed) would let callers distinguish
   failure modes without the parser throwing.

4. **Consumer migration to query helpers.** `textureatlas-formats` and `spritesheet-formats` still
   use `children.find()` and direct attribute access. Migrating them to the query helpers is
   optional cross-package cleanup that could happen when those packages are next in scope.

5. **Strict well-formedness mode.** An opt-in mode that validates tag matching, attribute
   uniqueness, and single-root constraint would serve consumers that need input validation without
   changing the tolerant default.
