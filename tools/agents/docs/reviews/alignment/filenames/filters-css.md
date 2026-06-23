# Filename Alignment: @flighthq/filters-css

**Verdict:** Clean. This is a backend-variant package (`-css`), so every source file must be prefixed PREFIX-FIRST with the `css` backend token — and all three are (`cssBlurFilter.ts`, `cssDropShadowFilter.ts`, `cssOuterGlowFilter.ts`), each naming the filter object it operates over. No issues found.

## Source files

```
src/
  cssBlurFilter.ts        cssBlurFilter.test.ts
  cssDropShadowFilter.ts  cssDropShadowFilter.test.ts
  cssOuterGlowFilter.ts   cssOuterGlowFilter.test.ts
  index.ts
```

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `cssBlurFilter.ts` — backend prefix-first (`css`) + filter object (`BlurFilter`). Bare name "cssBlurFilter" self-describes: CSS backend, blur filter. Exports `computeBlurFilterCss`.
- `cssDropShadowFilter.ts` — backend prefix-first + filter object (`DropShadowFilter`). Holds two exports (`computeDropShadowFilterCss`, `getShadowFilterOffset`), but both belong to the shadow domain the file names; `getShadowFilterOffset` is shared shadow/bevel offset math, so this is a domain file, not a one-function file.
- `cssOuterGlowFilter.ts` — backend prefix-first + filter object (`OuterGlowFilter`). Bare name self-describes. Exports `computeOuterGlowFilterCss`.
- `index.ts` — thin barrel re-exporting the three modules; not a dumping ground.
- Tests are colocated as `<source>.test.ts` and mirror each source filename exactly.
