---
package: '@flighthq/textshaper-harfbuzz'
crate: flighthq-textshaper-harfbuzz
rust: flight-rs
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textshaper-harfbuzz — Charter

> **Rust-intended (2026-07-11).** This cell is **designated for a Rust/wasm implementation, built in `flight-rs`** (which treats this monorepo as upstream). The name, seam, and intended contract below are the **authoritative upstream guidance**; the shaper itself is not TS work and is **not scaffolded here** (no `packages/textshaper-harfbuzz/`). Full-glyph shaping is compute-heavy and belongs in the Rust box alongside `surface-rs` — the `rust:` front-matter keeps this out of the local chartered-unbuilt queue while preserving the design here. See the `## Rust-intended` section of [TODO](../TODO.md).

## What it is

`@flighthq/textshaper-harfbuzz` is the **full-glyph text-shaping backend** — a `TextShaperBackend` (the swappable seam in `@flighthq/textshaper`) implemented over a HarfBuzz-equivalent shaper (**rustybuzz**), doing real OpenType **GSUB/GPOS** shaping: ligatures, contextual substitution, mark positioning, kerning, and complex-script (Arabic/Indic) shaping. It is the production upgrade from the advances-only `@flighthq/textshaper-canvas` default — the one that makes typographically-correct, complex-script text possible.

## North star

Register a `TextShaperBackend` (via `setTextShaperBackend`) whose `shapeTextRun`/`shapeTextRuns` run the font's GSUB/GPOS tables to produce positioned glyph IDs + offsets + advances (not just cluster advances). It consumes the itemized runs (script/direction/style from `textbidi`/`textsegment`, font from the resource) and emits the glyph stream `textlayout` positions and `glyphatlas` rasterizes. The seam is already glyph-bearing (bitmaptext landed), so this backend drops in behind it with no seam change.

## Boundaries

- **A `textshaper` backend, not a new seam.** It implements the existing `TextShaperBackend` contract in `@flighthq/textshaper`/`@flighthq/types`. No new public seam; it registers behind the current one.
- **Rust/wasm, built in `flight-rs`.** rustybuzz (+ the font-table access it needs) is the compute-heavy core — a wasm module, mirroring `surface-rs`. This monorepo owns the seam + the name + this charter; `flight-rs` owns the crate + wasm build + the `set*Backend` registrar shim.
- **Shaping only.** It does not itemize (that's `textbidi`/`textsegment`), lay out lines (`textlayout`), or rasterize glyphs (`glyphatlas`) — it turns an itemized run + font into positioned glyphs.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Rust-intended, built in `flight-rs`.** The `TextShaperBackend` seam and the harfbuzz/rustybuzz backend's contract are specified here as upstream guidance; the implementation is a `flight-rs` wasm crate. Marked `rust: flight-rs` so the local backlog treats it as designated-not-local.

## Open directions

1. **Backend selection.** How the app opts into the harfbuzz backend vs the canvas advances-only default (an explicit `registerHarfbuzzTextShaper(wasm)` in `flight-rs`, mirroring the host-adapter register pattern).
2. **Font-table source.** Whether rustybuzz reads the font bytes directly or through a shared font-parse layer (a potential `font-formats`/Rust font parser) — coordinate with the font cluster.
