# flight-text

Portable `TextLabel`, `NativeText`, and `RichText` display nodes over the canonical `Node2D`,
`TextFormat`, text-layout, and text-shaper contracts. The crate owns the pinned `text/src` package
and the approved D8 moves of rich-text content, rich-text metrics, and text-layout runtime helpers
from `flight-textlayout`. The lower crate retains only its pure layout types, constructors,
initializers, and algorithms.

## Nodes and runtime

Each display type composes `Node2DFields` and installs the corresponding local-bounds callback.
Setters preserve source no-op behavior and invalidate local content and bounds only where the
source contract requires it. `RichText` retains format references, emits its change/link/scroll
signals, and adjusts stored format spans as text is inserted or replaced. All text and range
indices are UTF-16 code-unit offsets represented by `usize` under D15.

Layout state is per node. The D5 `TextLayoutContext` replaces the source package's ambient measure
provider and stale-content guard with caller-owned state. An explicit measure provider takes the
canonical text-layout path; the host text-shaper capability is the fallback. Layout computation is
performed outside the cached result lock so a measure callback may safely re-enter layout. Guards,
providers, and caches are never process-global.

`TextInputState`, `TextInputHistoryEntry`, and `TextInputOptions` are text-owned typed records.
`RichTextRuntime` may retain a shared input state for password presentation, but this crate does
not invent editing APIs or depend on a separate text-input implementation.

## Export lanes

The crate root follows the pinned `text/src/index.ts` public lane. Construction/runtime
initializers, `TextLayoutContext`, cache access, the relocated D8 helpers, and the explicit D5 guard
setter remain available through `flight_text::contract`. `ensure_text_layout` is likewise
contract-only; the public lane exposes `get_text_layout` and `get_text_layout_metrics`, which ensure
the cache as part of their contract.

## Sugar (D18)

`NativeText::new`, `TextLabel::new`, and `RichText::new` mirror their factories. The
`NativeTextMethods`, `TextLabelMethods`, and `RichTextMethods` extension traits expose the public
operations on their shared `Ref` handles. `TextNodeMethods` covers the public node explanation and
layout queries, and `TextFormatFontMethods` covers the CSS-style font string. Every one of the 76
constructors and methods is a thin free-function delegate with its own inline comparison test.
Contract-only context, cache, content, metric, and runtime operations deliberately receive no
sugar.

## Verification and precision

The integration suite ports all 238 pinned source cases and adds one Rust-only check for the
caller-owned context. It covers construction, defaults, invalidation, stable shared identity,
format-range mutation, UTF-16 editing, signals, layout caching, bounds, metrics, password masking,
guards, and reentrant measurement. The 76 D18 comparisons are separate inline unit tests.

Layout, geometry, style metrics, and scroll values use `f32`; packed RGBA colors use `u32`.
The only `f64` values are the injected guard clock and warning timestamp because `flight-log`
records millisecond timestamps at that precision.
