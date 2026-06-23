# Filename Alignment: @flighthq/filters-canvas

**Verdict:** Clean. This is a backend-variant package (`*-canvas`), so every source file must be prefixed backend-first with the `canvas` token — all three are (`canvasBlurFilter.ts`, `canvasDropShadowFilter.ts`, `canvasOuterGlowFilter.ts`), each names the filter object (not the function), and tests mirror the source names. No renames needed.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `canvasBlurFilter.ts` — backend prefix-first (`canvas`) + filter object (`BlurFilter`). Names the object, not the function `applyBlurFilterToCanvas`. ✓
- `canvasBlurFilter.test.ts` — colocated, mirrors source. ✓
- `canvasDropShadowFilter.ts` — backend prefix-first + filter object (`DropShadowFilter`). ✓
- `canvasDropShadowFilter.test.ts` — colocated, mirrors source. ✓
- `canvasOuterGlowFilter.ts` — backend prefix-first + filter object (`OuterGlowFilter`). ✓
- `canvasOuterGlowFilter.test.ts` — colocated, mirrors source. ✓
- `index.ts` — thin re-export barrel; conventional, not a dumping ground. ✓

Consistent with the sibling backend package `filters-css` (`cssBlurFilter.ts`, `cssDropShadowFilter.ts`, `cssOuterGlowFilter.ts`), confirming the prefix-first pattern is the established norm across the filters backend family.
