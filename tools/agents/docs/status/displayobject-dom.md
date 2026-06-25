# displayobject-dom — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/displayobject-dom` by merging gitignored `dist/*.js` (implementation + comments) with `dist/*.d.ts` (type signatures), the validated camera pattern.

### Recovered

- **`domSvgFilter.ts`** (new module) — `getDomSvgColorMatrixFilter(filter)` and `releaseDomSvgColorMatrixFilter(id)`. SVG-`feColorMatrix`-backed CSS filter path for `ColorMatrixFilter`: injects an inline `<filter>` into a shared hidden `<svg>` container and returns a `url(#id)` CSS string; offset columns divided by 255 (Flash 0–255 → SVG 0–1). Genuine functionality, only depends on `ColorMatrixFilter` (present in `@flighthq/types`). Test file reconstructed from `dist/domSvgFilter.test.js`. Added `export * from './domSvgFilter'` to index.ts.
- **`domCSSFilterBinding.ts`** — added `hasDomCssFilterEquivalent(filter)` plus the `DOM_CSS_FILTER_KINDS` set (Blur/DropShadow/OuterGlow). Existing module was missing this one exported function; tests added for it. Depends on `BitmapFilter` (present in `@flighthq/types`).
- **`domDisplayObject.ts`** — added `drawDomDisplayObject(state, renderProxy)` (no-op container draw) and the `defaultDomDisplayObjectRenderer` const (createData: noopRendererData, submit: drawDomDisplayObject). Existing module had only `renderDomDisplayObject`. Tests added for both.

### Skipped fossils

None. No recovery candidate mapped to a deliberately-dropped/deprecated concept.

### Parked

- **`domAccessibility.ts`** (whole module: `enableDomAccessibility`, `getDomAccessibilityDescriptor`, `setDomAccessibilityDescriptor`) — needs type `AccessibilityDescriptor` in `@flighthq/types` AND an `applyAccessibility` slot on the `DomRenderState` interface in `@flighthq/types`. Both are absent. Editing `@flighthq/types` is outside this task's hard boundary, so the module is parked rather than recovered.
- **`getDomBlendModeFidelity` (in `domMaterials.ts`)** — needs type `DomBlendModeFidelity` in `@flighthq/types` (the `DOM_BLEND_MODE_FIDELITY` map and the return type). Type absent; editing `@flighthq/types` is out of bounds. The other two `domMaterials` exports (`applyDomBlendMode`, `enableDomBlendModeSupport`) were already present in src and untouched.

### Test result

`npm run test --workspace=packages/displayobject-dom` → 26 files, 181 tests, all passing.
