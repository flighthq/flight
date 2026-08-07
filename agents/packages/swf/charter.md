---
package: '@flighthq/swf'
role: package
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
tagCoverage: ./tag-coverage.md
fixtureEvidence: ./fixture-evidence.md
shaPinIncidentalAudit: ./sha-pin-incidental-audit.md
---

# swf — Charter (reserved home)

## What it is

`@flighthq/swf` is the reserved home for **SWF (Flash) import** — parsing Adobe/Macromedia Flash
`.swf` bytes into Flight data. It is a **domain package**, not a `-formats` codec: SWF is a large,
distinct domain (shapes, bitmaps, text, fonts, MovieClip timelines, named instances, symbol linkage,
sounds, video, filters, morph, tag versions), so it graduates to its own greppable cell — exactly as
`movieclip`, `sprite`, and `particleemitter` are their own packages despite being leaf node types in
the `scene2d` graph. A shared contract does not force one package; a huge domain earns its own.

SWF is the **archetypal named-graph source** — the format the "named 2D node graph" contract (#3) was
modeled on. Its MovieClip symbols (nested timelines), named instances, and `SymbolClass` linkage *are*
the slot + linkage model. Importing SWF delivers the large archive of existing Flash content and
**validates #3 against the format it descends from**.

## North star

Read the archive completely, and hand it over as Flight data that plays itself through Flight's own
engines. Complete `.swf` structural coverage — shapes, bitmaps, fonts, static and editable text,
MovieClip symbols and their timelines, named instances with transforms, per-frame appearance, masks,
morphs, sounds — landing on existing Flight subjects and nothing new, so an imported document is
indistinguishable in kind from one built by hand. The importer keeps no runtime: it produces the data
`movieclip`/`timeline` plays. Formats SWF merely carries — compression and ABC bytecode — are resolved
through registered seams rather than vendored, and executing bytecode is never in scope. Where a tag has
no honest Flight subject yet, it is reported or declined rather than approximated, and the gap is
recorded; a document that silently misrepresents what the file said is worse than one that says less.

## Peer, not a child (the dependency shape)

`swf` is a **peer** of `scene2d-formats`, not a codec inside it and not `scene2d-formats-swf`. It
depends on the **shared lower layer** directly — `@flighthq/types` (`Scene2DDocument`, options),
`@flighthq/importdiagnostics`, and the output primitives (`shape`, `scene2d`, `movieclip`, `timeline`,
`image`, `text`, `path`, `clip`) — the same layer `scene2d-formats` uses. It does **not** depend on
`scene2d-formats`, and `scene2d-formats` does not consume it. Entry: `createScene2DFromSwf(bytes,
options) → Scene2DDocument`. It optionally registers into the `scene2d-resources` import registry (an
open registry it registers *into*; the registry depends on no codec — see that charter).

## Scope

`.swf` **structure** → Flight data: shapes (`DefineShape*` → `shape`), bitmaps (`DefineBits*` →
`image`), text (`DefineText`/`DefineEditText` → `text`), MovieClip symbols (`DefineSprite` + timelines
→ `movieclip`/`timeline`), placed named instances with transforms/color-transforms/blend/masks
(`PlaceObject*` → `Node2D`), and `SymbolClass`/`ExportAssets` **linkage** → a `Scene2DDocument` whose
slots come from named instances and whose linkage types come from the symbol→class-name mapping.

## Two things SWF *carries* but this cell does not own

SWF is a container. Two formats ride inside it and are **separate concerns**, handled the same way —
exposed, not owned:

- **Compression (`CWS` zlib / `ZWS` LZMA).** The compressed-body format is general, not SWF's display
  domain. `swf` decompresses through a **registered seam** (the `registerAwd2DeflateDecompressor`
  precedent in `scene3d-formats`); it does not vendor a compression library.
- **ABC / AVM2 bytecode (`DoABC`).** ABC is its **own bytecode format** (also used standalone in
  `.abc` files) that SWF merely carries — the same relationship SWF has to LZMA. So it is **out of
  `swf`'s scope**: `swf` exposes the `DoABC` payload as an **opaque blob** (via a seam), and does not
  parse it. Note the load-bearing #3 need — **linkage names — comes from `SymbolClass`, a display-tag
  that gives class-name strings directly, with no ABC parsing at all.** Disassembling ABC into
  structured data (an AS→read migration aid) is a **distinct concern** — a separate `abc`/AVM-format
  parser behind that seam, never inside `swf`. **Executing** it is never in scope anywhere (a VM is an
  emulator — Ruffle's domain, external; see [anti-goals](../../anti-goals.md)).

## Boundaries (for when it is built)

- **Codec, not a Flash player.** Output is Flight `shape`/`movieclip`/`timeline`/bitmap/text data + a
  `Scene2DDocument` with slots/linkage. No SWF runtime is retained; Flight's `movieclip`/`timeline`
  *is* the MovieClip runtime — the importer produces their data, it does not embed a player.
- **Well-homed outputs only.** Every display-tag maps onto an existing Flight subject; no new
  primitive. Streaming sound → `@flighthq/audio` references; morph shapes (`DefineMorphShape`) target
  `@flighthq/shape`'s `MorphShape` once the SWF edge/style producer is implemented (the current decoder
  still honestly skips the visual body).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-25] Standalone domain package, not a codec and not `-formats`-suffixed.** SWF is a huge,
  distinct domain → its own `@flighthq/swf` cell (the `movieclip`/`sprite` graduation pattern), a peer
  that produces `Scene2DDocument` over the shared layer. Not `swf-formats` (source-named `-formats` is
  reserved for target-named cells) and not `scene2d-formats-swf` (it doesn't depend on
  `scene2d-formats`). Bless-to-build is the user's. User-directed 2026-07-25.
- **[2026-07-25] ABC is a carried format, not SWF's domain.** Like LZMA, ABC bytecode is exposed as an
  opaque blob and handled by a separate concern, never parsed or executed inside `swf`. Linkage comes
  from `SymbolClass` with no ABC parsing. Execution is never in scope (emulator). User-directed
  2026-07-25.
- **[2026-07-25] Legacy-import framing.** SWF is chartered for preservation and #3 validation, not
  forward authoring (Rive owns that). A deliberate archive capability, not a demo blocker.
- **[2026-07-30] Build SWF as the first named-graph source.** The first slice is portable TypeScript
  and deliberately proves the structural contract before visual-tag breadth: uncompressed `FWS`,
  root-timeline `PlaceObject2`/`PlaceObject3` named instances, transforms, and
  `SymbolClass`/`ExportAssets` linkage produce a `Scene2DDocument`. Rive is sequenced second; a
  duplicate SVG path is declined because `scene2d-formats` already owns SVG documents. User-directed
  2026-07-30.
- **[2026-07-30] Keep canonical binary evidence external and reproducible.** The authorized Ruffle
  fixture is fetched only into ignored local storage. Flight commits its revision-pinned provenance,
  source hash, derived document manifest, and reproduction procedure; hermetic tests reproduce the
  relevant encoding synthetically and never require the asset or network.
- **[2026-08-01] Embedded outline fonts compose through the shared font/glyph stack.** `DefineFont*`
  produces the generic, glyph-index-keyed `GlyphOutlineSource` owned by the font layer rather than
  widening the raster `GlyphSource`. SWF static text walks that source as vector paths; callers can bind
  the same source explicitly to glyphatlas through the font rasterizer adapter. User-directed 2026-08-01.

## Open directions

1. **Heavyweight backend threshold.** The structural named-graph baseline is portable TypeScript.
   Decide whether deeper visual-tag decode remains there or earns a `rust:` backend (like
   `surface-rs`) only when its measured binary/decompression weight justifies the seam.
2. **Version + tag baseline.** Which SWF versions and tag set form the AAA core (vector + MovieClip +
   text + bitmap + linkage), with filters/morph/streaming-video as deepening.
3. **`DefineFont4`.** Decide whether its embedded CFF/OpenType bytes are exposed opaquely as another
   carried format or parsed by a separate general font-format producer of `GlyphOutlineSource`.
4. **The separate `abc` parser** — if an AS→read migration aid is ever wanted, a distinct
   AVM-format cell consuming the `DoABC` blob (never a VM). Ranks low; the #3 contract needs none of
   it.
