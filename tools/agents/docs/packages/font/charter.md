---
package: '@flighthq/font'
crate: flighthq-font
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# font — Charter

## What it is

`@flighthq/font` is the **font resource lifecycle manager** — create, load, and reference fonts via the browser `FontFace` / `document.fonts` API. 10 exports across 4 source files. Dependencies: `entity`, `types`. Extracted from the old `@flighthq/resources`.

Two parallel APIs that do identical loading work but return different types:
- **`Font`** (entity) — a string handle. `{ name }` extending `Entity`. The text system references fonts by family name; this is what it consumes.
- **`FontResource`** (plain object) — `{ family, face: FontFace | null }`. Holds the actual `FontFace` object for lower-level access (metrics, variation axes).

Both create a `FontFace`, call `.load()`, add to `document.fonts`. The distinction is return value: named entity vs FontFace holder.

## North star

1. **Resource lifecycle, not rendering or layout.** Font owns loading and registering fonts. Text rendering, glyph layout, and shaping are separate packages (text, textlayout, textshaper).
2. **Honest async APIs.** If loading is async, the API is async. No fire-and-forget patterns that silently swallow errors.
3. **`Uint8Array` for byte input.** SDK-wide convention for byte seams.

## Boundaries

**In scope:**

- Font loading from ArrayBuffer, URL, multiple URLs with format hints, and by name (already registered).
- Font format inference from file extensions (woff, woff2, ttf, otf, eot, svg).
- Font entity creation (string handle for the text system).
- FontResource creation (FontFace holder for lower-level access).

**Non-goals:**

- Text rendering — `@flighthq/text`, `@flighthq/textlayout`.
- Font shaping (HarfBuzz/rustybuzz) — `@flighthq/textshaper`.
- Font metrics computation — consumer packages.
- Font binary parsing — future `@flighthq/font-codec` or part of textshaper.

## Decisions

- **[2026-07-02] Clarify dual API identity.** `Font` is a string handle (entity with `name` — what the text system references). `FontResource` holds the actual `FontFace` object (lower-level access to the loaded binary). Both are valid — one references by name, the other holds the data. Whether both are needed or should unify into one type is an open direction.

  **Why:** The two types serve different consumers — text rendering (needs a family name string) vs font management (needs the FontFace object). Understanding the distinction is prerequisite to deciding whether to merge.

- **[2026-07-02] `ArrayBuffer` → `Uint8Array` for byte input.** `loadFontFromArrayBuffer` and `loadFontResourceFromArrayBuffer` should accept `Uint8Array` per the SDK-wide convention. Rename to drop `ArrayBuffer` from the function name (e.g. `loadFontFromBytes` / `loadFontResourceFromBytes`).

  **Why:** SDK-wide byte input convention established in the image charter. `Uint8Array` matches Rust `&[u8]`.

- **[2026-07-02] DRY the `inferFontFormat` helper.** `inferFontFormat` is duplicated identically in `fontFrom.ts` and `fontResourceFrom.ts`. Extract to a shared internal module or export as a utility.

  **Why:** Literal copy-paste duplication within one package.

- **[2026-07-02] Scope ceiling TBD — needs breadth review.** The package is new enough (extracted 2026-06-25) that no depth or maturation review exists. Whether it needs growth for AAA completeness is an open question that a breadth review should answer.

  **Why:** Can't assess completeness without understanding the full font lifecycle domain.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Unify Font and FontResource?** Both do identical loading work. Options: (a) merge into one type that carries both entity identity and FontFace reference, (b) keep both as distinct consumer-facing abstractions (string handle vs data holder), (c) drop Font entity entirely (just use the family name string — do you need an entity wrapper for a string?). Needs input from the text/textlayout consumer perspective.

2. **Breadth review for AAA completeness.** What does a complete font lifecycle package look like? Font variation support? Font fallback chains? Subset loading? Web font loading events/progress? System font enumeration?

3. **Relationship to textshaper.** The Rust port's text stack uses rustybuzz + ttf-parser. On the TS side, font binary parsing may be needed for textshaper-canvas or a future DOM-free shaper. Where does binary font parsing live — here, in textshaper, or in a font-codec neighbor?
