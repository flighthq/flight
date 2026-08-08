---
package: '@flighthq/color'
updated: 2026-08-08
by: principal
---

# color — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/color/src/` on 2026-08-08. The extraction itself is complete and the two
lanes are in sync — `index.ts` re-exports every name `contract.ts` reaches — so what is left is colour
math that still lives outside this package.

- **`particles` carries its own HSV conversions.** `packages/particles/src/curve.ts:117` and `:186`
  define private `hsvToRgb` / `rgbToHsv` over float channels, each returning a freshly allocated
  `[r, g, b]` tuple; color's own `hsvToRgb` / `rgbToHsv` (`hsvColor.ts:10`, `:60`) are packed-int with
  an `out` parameter. `particles` has no `@flighthq/color` dependency. Folding these is a rewrite
  of the particle colour path, not a de-dup.
- **The Kelvin approximation exists twice.** `colorFromKelvin` (`colorFromKelvin.ts:8`) and
  `packages/effects/src/colorTemperatureMath.ts:10` carry the same piecewise coefficients. Effects
  writes normalized linear multipliers into an `out` parameter and pins green to 1.0; color returns a
  packed sRGB value. `effects` has no color dependency, so the shared kernel is unextracted.
- **`bitmap` has nothing to fold.** Its premultiply is buffer-level over RGBA bytes
  (`packages/bitmap/src/bitmapFormat.ts:41`, `:63`), a different tier from color's packed-int
  `premultiplyColorAlpha` (`premultiplyColorAlpha.ts:5`). This answers the charter's "fold `bitmap`
  colour math in" open direction as a no-op rather than deferred work.
- **Hex is one-way.** `computeRgbHexString` (`packColor.ts:13`) writes a hex string; nothing in the
  package parses one back.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified every claim against source and converted to the Open + Log contract; the
  "color re-exports `LinearColor`" claim is **false** (no `export type` anywhere in `src/`; `packColor.ts:1`
  only type-imports it) and was deleted with the stale "single `.` entry" and "no code exists yet" lines.
- **2026-07-17** — Extracted from `materials/color.ts` into nine files; effects' colour-science duplicates
  deleted as dead code; Kelvin moved from `lighting` and renamed `colorFromKelvin`; consumers re-pointed
  and four `scene2d-*` packages dropped an orphan `materials` dependency.
- **2026-07-17** — Phong→PBR migration lands in `@flighthq/materials/src/phongToPbr.ts`
  (`convertPhongToStandardPbrMaterial` plus the three free functions it composes), not in color; F0 and
  reflectance stay in `materials`.
- **2026-07-17** — Chartered: bedrock leaf depending on `@flighthq/types` alone, not folded into
  `@flighthq/math`; `LinearColor` stays in `@flighthq/types`; the unclamped sRGB transfer
  (`srgbChannelToLinear` / `linearChannelToSrgb`) is canonical and clamping is a caller concern.
