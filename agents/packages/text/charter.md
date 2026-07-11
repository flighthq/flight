---
package: '@flighthq/text'
crate: flighthq-text
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# text — Charter

## What it is

`@flighthq/text` is the **display-object entity layer** for text — the `TextField` family as scene-graph entities, exposed as plain entity + runtime + free functions. It owns three entity families: `TextLabel` (simple single-format), `RichText` (rich multi-format with scroll, format ranges, and programmatic mutation), and `NativeText` (platform-rendered, measured externally).

This package is the entity layer, not the text engine. The engine is a layered stack distributed across sibling packages:

- **`@flighthq/textlayout`** — glyph layout, line breaking, line/paragraph metrics, hit testing, selection geometry.
- **`@flighthq/textinput`** — caret, selection, interactive editing, keyboard/IME handling. Makes `RichText` editable via the `input` slot on `RichTextRuntime`.
- **`@flighthq/textshaper`** — shaping/measure provider seam (kerning, ligatures, bidi, complex scripts).
- **Renderer packages** — per-backend rasterization (`displayobject-canvas`, `displayobject-gl`, etc.).

The `text` package name is broad relative to its charter. A reader importing `@flighthq/text` expecting a text _engine_ will find the layout/shaping/editing surface is elsewhere. This is the intended split — the package owns the display objects, and the map documents the delegation.

## North star

1. **Display-object entities with full field-level control.** Every `RichTextData`/`TextLabelData`/`NativeTextData` field has a first-class `set*` mutator with diff-skip and correct invalidation (content vs bounds). The setter surface is complete and symmetric — reads and writes for every field, no half-and-half coverage.
2. **Programmatic mutation on the static entity.** `text` owns API-driven text mutation: `appendRichTextString`, `insertRichTextString`, `replaceRichTextString`, `setRichTextFormatRange`, format-range re-indexing. Interactive editing (keyboard, IME, caret) is `textinput`'s domain via the nullable `input` slot.
3. **Lazy layout cache, revision-gated.** `ensureTextLayout` / `getTextLayout` follow the node graph's `ensure*` pattern — revision-stamped, idempotent, render-pass-free. Metric convenience wrappers (`getRichTextLineCount`, `getRichTextTextWidth`, etc.) call `ensureTextLayout` and return sentinels when no measure provider is registered.
4. **The entity layer is a thin, stable surface.** The hard text problems (shaping, layout, editing) are elsewhere. This package changes when the entity model changes, not when the engine evolves.

## Boundaries

**In scope:**

- Three entity families: TextLabel, RichText, NativeText — each with create/data/runtime quartet.
- Full setter/getter surface for all data fields, with diff-skip and invalidation.
- Programmatic text mutation: append, insert, replace, format-range manipulation.
- AutoSize bounds computation (the standard anchor model: none/left/right/center).
- Scroll model (scrollH/scrollV with clamping, wheel dispatch).
- Lazy layout cache plumbing (`ensureTextLayout`, `getTextLayout`, metric convenience wrappers).
- TextField signals group (`enableTextFieldSignals` — change/link/scroll).

**Non-goals:**

- Glyph layout, line breaking, metrics — `@flighthq/textlayout`.
- Caret, selection, interactive editing — `@flighthq/textinput`.
- Shaping, measure provider — `@flighthq/textshaper`.
- Per-backend rasterization — renderer packages.
- HTML/CSS parsing — potentially a `@flighthq/text-formats` neighbor (Open direction #2).

## Decisions

- **[2026-07-02] Text owns display-object entities, not the text engine.** TextLabel (simple single-format), RichText (rich multi-format), NativeText (platform-rendered). The text engine (layout, shaping, editing) is distributed across sibling packages. The entity layer is a thin, stable surface that delegates the hard problems.

  **Why:** The text stack is a layered problem (entities → layout → shaping → rendering → editing). Bundling it all in one package would violate the cellular architecture — a user who only needs a text label shouldn't pull in shaping or editing. The classic model bundles everything in `TextField`; Flight decomposes it into independently importable primitives.

- **[2026-07-02] Programmatic mutation lives on text; interactive editing on textinput.** `appendRichTextString`, `insertRichTextString`, `replaceRichTextString` are API-driven text operations on the static entity. Interactive editing (keyboard, IME, caret management, drag selection) plugs in via textinput's nullable `input` slot on `RichTextRuntime`. Text works without textinput; textinput enriches RichText.

  **Why:** A non-editable rich text field still needs programmatic text manipulation (updating a score display, building text programmatically). These operations don't require a caret or keyboard handling. The `input` slot makes the interactive layer opt-in — same pattern as the signals `enable*` convention.

- **[2026-07-02] The `*Value` suffix is dropped — clean metric names are correct.** The metric convenience wrappers use direct names (`getRichTextLineCount`, `getRichTextTextWidth`, `getRichTextMaxScrollH`, etc.) without a `Value` suffix. The earlier collision-dodging suffix was resolved by the builder; the clean names are the final form.

  **Why:** The `Value` suffix was a workaround for name collisions with textlayout functions. The clean names are self-identifying and follow the `getRichText*` convention without an artificial suffix that communicates nothing.

- **[2026-07-02] Pre-release code must not use backward-compatibility language.** The `_text` parameter in textlayout's `computeRichTextCharIndexAtPoint` is documented as "kept for backward compatibility; will be removed in a future breaking release." This is wrong for unreleased code — there are no consumers, no migration paths. Flag for removal outright.

  **Why:** Pre-release status means every API decision is foundational. Accumulating "backward-compatible" dead parameters is the exact workaround-accumulation pattern the project philosophy forbids.

## Open directions

1. **Package rename.** The name `text` is broad relative to the package's actual charter (display-object entities only). Considered and rejected: `textfield` (the historical heritage, but `TextField` isn't a type in this package — `TextLabel` and `RichText` are), `textlabel` (too narrow — undersells `RichText` and `NativeText`). `text` is probably fine as the umbrella name for all text display objects. Low priority unless a better name surfaces.

2. **`text-formats` neighbor package.** `setRichTextHtml`, `setRichTextCondenseWhite`, `setRichTextStyleSheet` store fields + invalidate, but textlayout's `computeRichTextContent` doesn't consume them yet. A `@flighthq/text-formats` package (HTML/CSS parse seam, registry-dispatched like the shaper) would be the natural home — but it needs a plurality check (≥2 formats) before spinning up. HTML and CSS stylesheets may be enough; Markdown would clinch it.

3. **Signal ownership: text vs textinput.** TextField signals (change/scroll/link) currently fire from the text package on programmatic mutation. Open questions: Should they _only_ fire when textinput is active? Should selection/caret signals exist, and if so, do they belong in text or textinput? This cascades from the text/textinput boundary — settle during the textinput direction session.

4. **Scroll and selection display: entity state or input state?** RichText carries scroll position (`scrollH`/`scrollV`) and selection indices (via the `input` slot) as entity state. Scrolling feels like a display concern (it affects rendering), but selection highlighting is more ambiguous — is it display state or input state? The current design puts scroll on the entity and selection on the input slot, which may be the right line. Settle alongside #3.

5. **Rust `flighthq-text` port posture.** Waits until #1–#4 settle — they shape the final TS surface the port conforms to.
