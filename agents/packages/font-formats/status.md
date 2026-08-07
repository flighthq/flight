---
package: "@flighthq/font-formats"
updated: 2026-08-07
by: builder
---

# font-formats — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-07 — package created, `glyf` outlines reading

Created the package and its charter. The charter leads with the sizing point and the licence line
because those two decide how this work is estimated and how it is judged; both were settled before any
code was written.

**In flight:** the sfnt container reader, the flavor-independent tables (`head`, `hhea`, `maxp`,
`hmtx`, `cmap`), and quadratic `glyf`/`loca` outlines, assembled into a `GlyphOutlineSource`.

**Watch next, in the order they will matter:**

- **`CFF `/`CFF2` is a stated absence, not a gap that slipped.** A charstring font is rejected with
  `unsupported-outlines` naming the table it found. SWF `DefineFont4` needs exactly this, so direction 1
  is the one with a named consumer waiting.
- **Which consumer's flavor is first has not been measured.** SWF `DefineFont4` is CFF by the format's
  definition. What Rive embeds in a `FontAsset`'s `bytes` is **assumed, not established** — no real
  `.riv` with a font asset was read. Measure before scheduling CFF against it.
- **`@flighthq/importdiagnostics` is deliberately not adopted yet**, because that seam was under active
  change while this package was written. The `explain*` pull query covers the rejection cases today.
