---
package: '@flighthq/scene2d-dom'
updated: 2026-08-08
by: principal
---

# scene2d-dom — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/scene2d-dom/src/` on 2026-08-08. Before filing anything here: the batch
kinds (`QuadBatch`, `Tilemap`, `BitmapText`, `ParticleEmitter2D`) are a **recorded design exclusion**
with two sanctioned embed paths, not a gap — see [registration model §6](../../registration-model.md).
The leaf set DOM carries is `Sprite`, `NativeText`, `RichText`, `TextLabel`, `Shape`, `Scale9Shape`,
plus `HtmlView` and `TextInput`, and that is the intended set.

- **`getDomBlendModeFidelity` returns `undefined` for any mode outside the built-in table.**
  `BlendMode` is an open string family, but the lookup is a bare `Record` index with no fallback
  (`domMaterials.ts:72`), while `applyDomBlendMode` (`:55`) correctly guards with `?? ''`. A
  vendor-prefixed mode therefore gets a value that violates the declared `DomBlendModeFidelity` return
  type. The `'unsupported'` arm is also unreachable today: every entry in `DOM_BLEND_MODE_FIDELITY`
  (`:34-52`) is `'exact'` except `Add`, which is `'approximate'`.
- **The only image-operation door is a raw CSS string.** `setDomCssFilter(state, node, filter)`
  (`domCSSFilterBinding.ts:26`) takes a hand-written CSS `filter` value; there is no `effects-dom`
  package and no `registerDomRenderEffect` anywhere in `packages/`, so no `Effect` descriptor can be
  realized on this backend. A portable descriptor route needs the descriptor↔proxy binding, a
  descriptor→CSS resolver, fidelity rules, and fallback ownership — all unbuilt, as recorded in
  [public-lane-audit.md](public-lane-audit.md).
- **No accessibility seam exists.** `enableDomAccessibility`, `getDomAccessibilityTree`, and an
  `applyAccessibility` slot on `DomRenderState` have zero occurrences in `packages/`. The
  `AccessibilityDescriptor` type is real (`packages/types/src/AccessibilityDescriptor.ts`) but has no
  consumer in any package — a header with nothing implementing it.
- **No `explainDomScene2DCoverage`.** `scene2d-gl` and `scene2d-canvas` each wrap the backend-agnostic
  `explainScene2DCoverage`/`hasScene2DCoverage` from `@flighthq/render`; DOM's explain surface stops at
  `explainDomTextureResolution` and `explainDomImageSource`, so "will this scene draw on DOM" has no
  query here.
- **`enableDom*` is inconsistent in both shape and name.** `enableDomTextInput()`
  (`domTextInput.ts:66`) takes no state — it writes a module-global overlay slot via
  `registerDomTextInputOverlay` (`domRichText.ts:231`), so two render states cannot differ. It is the
  only stateless one of the six. Separately, three carry a `Support` suffix
  (`enableDomBlendModeSupport`, `enableDomClipSupport`, `enableDomCssFilterSupport`) and three do not
  (`enableDomRenderCache`, `enableDomTextInput`, `enableDomTextureResolverGuards`).
- **Two manifest dependencies are not used by source.** `@flighthq/log` appears only in
  `enableDomTextureResolverGuards.test.ts`; `@flighthq/signals` appears in no file at all.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-25 entry's flat claim that
  "there is no `getDomBlendModeFidelity`" is **false**: it and its table live at `domMaterials.ts:34-72`
  with colocated tests. Also dropped as false: the HiDPI backlog — `domShape.ts:57-64`,
  `domScale9Shape.ts:68-76`, and `domSprite.ts:80-87` all size their backing canvas at
  `state.pixelRatio` and scale the context — and the "sprite-graph design gate", which was ruled in
  [registration model §6](../../registration-model.md). `drawDomBitmap`/`domBitmap.ts` no longer exist;
  the kind is `Sprite`. The `enableDomAccessibility` / `hasDomCssFilterEquivalent` /
  `getDomSvgColorMatrixFilter` seams the 2026-06-24 entry described as implemented are still absent, so
  that entry's whole second half was discarded.
- **2026-06-25** — Source audit found the accessibility, filter-equivalence, and SVG-filter seams absent
  despite the prior entry claiming them; both dependent sweep items parked.
- **2026-06-24** — Builder pass claiming accessibility, blend-mode fidelity, CSS-filter equivalence, an
  SVG `<feColorMatrix>` path, and caret styling from `TextInputState`. Only the last two survive: the
  fidelity table, and `input.caretColor`/`caretWidth` read at `domTextInput.ts:55`.
