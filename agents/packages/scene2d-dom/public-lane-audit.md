# scene2d-dom CSS-filter public-lane audit

## Conclusion

`enableDomCssFilterSupport` was stranded in the package's contract lane. The public lane now exports it
in alphabetical order. It also exports `setDomCssFilter`, the only operation that can populate the
binding read by the enabled resolver. `getDomCssFilter` remains contract-only because its
`RenderProxy2D` argument is renderer plumbing, not an application-facing decision.

This setter/getter placement is an explicit API judgment, not a mechanical consequence of promoting
the opt-in. Publishing `setDomCssFilter` exposes the package's existing DOM-only raw-CSS escape hatch;
it does not make raw CSS strings a portable cross-backend filter API. A descriptor-based filter path
still needs an architectural decision and implementation.

The SDK already re-exports `@flighthq/scene2d-dom` from `packages/sdk/src/rendering.ts`, so the package
public lane was the only missing link. No SDK change is needed.

## Exhaustive `enableDom*` sweep

Criterion: every real function exported by the scene2d-dom contract whose name starts with
`enableDom` is an application opt-in for a backend capability, so it belongs in `.`. The sweep searched
all package source declarations and compared the resulting names with `src/index.ts`; documentation-only
names were not treated as source contracts.

| Contract export | Public lane after repair | Evidence |
| --- | --- | --- |
| `enableDomBlendModeSupport` | yes | `domMaterials.ts` |
| `enableDomClipSupport` | yes | `domClip.ts` |
| `enableDomCssFilterSupport` | yes | `domCSSFilterBinding.ts`; repaired here |
| `enableDomRenderCache` | yes | `domCache.ts` |
| `enableDomTextInput` | yes | `domTextInput.ts` |
| `enableDomTextureResolverGuards` | yes | `enableDomTextureResolverGuards.ts` |

These are all six real `enableDom*` exports. `enableDomAccessibility` is not source: it appears only in
the scene2d-dom cell documents.

## CSS-filter API evidence and remaining gap

`DomRenderState.domCssFilterResolver` has the raw-string type
`(renderProxy: RenderProxy2D) => string | undefined`. `enableDomCssFilterSupport` installs
`getDomCssFilter` into that slot. The module's private `WeakMap<RenderProxy2D, string>` can only be
populated through `setDomCssFilter(state, node, filter)`, whose `Node2D` input is application-facing.
Exporting the enable function without the setter would therefore publish a capability that an app
cannot use. The getter remains available to sibling/backend code through `/contract`.

There is no source for a filter descriptor binding, `hasDomCssFilterEquivalent`, `domSvgFilter.ts`,
`getDomSvgColorMatrixFilter`, or an SVG `<feColorMatrix>` path. There is also no pirate or pirate-pig
sample in this repository to verify; the referenced sample lives outside this checkout. Supporting a
portable descriptor route would require defining the descriptor-to-node/proxy binding, a descriptor to
CSS resolver, equivalence/fidelity rules, and SVG or raster fallback ownership. None is built by this
repair.

## Cell-document contradictions left untouched

- `charter.md` presents accessibility, filter-equivalence reporting, and an SVG color-matrix path as
  package capabilities even though their named source seams do not exist.
- `review.md` and `assessment.md` likewise treat `enableDomAccessibility`,
  `hasDomCssFilterEquivalent`, and the SVG filter module as verified-present foundations.
- `status.md` is internally contradictory: its initial source audit correctly says those seams are
  absent, but it also says `getDomBlendModeFidelity` is absent even though that function and its tests
  now exist in `domMaterials.ts`; later sections then describe all of the absent seams as implemented.

Those four records were not repaired as part of this public-lane change.

## Reachability coverage audit

The untouched tree produced this exact output:

```text
> reachability:check
> tsx ./scripts/reachability.ts --check

OK Built-in runners and per-kind registrars are exact inverses

! 12 reachability lane changes (non-blocking)
  + effects-canvas defaultCanvasBevelEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasCompositeEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasGradientBevelEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasGradientGlowEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasInnerGlowEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasInnerShadowEffectRunner absent → . + ./contract
  + effects-canvas registerCanvasBevelEffect absent → . + ./contract
  + effects-canvas registerCanvasCompositeEffect absent → . + ./contract
  + effects-canvas registerCanvasGradientBevelEffect absent → . + ./contract
  + effects-canvas registerCanvasGradientGlowEffect absent → . + ./contract
  + effects-canvas registerCanvasInnerGlowEffect absent → . + ./contract
  + effects-canvas registerCanvasInnerShadowEffect absent → . + ./contract
  Review the moves, then run npm run reachability:baseline to accept the curated lane placement.
```

After adding the two public exports, the command produced the same exact output:

```text
> reachability:check
> tsx ./scripts/reachability.ts --check

OK Built-in runners and per-kind registrars are exact inverses

! 12 reachability lane changes (non-blocking)
  + effects-canvas defaultCanvasBevelEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasCompositeEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasGradientBevelEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasGradientGlowEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasInnerGlowEffectRunner absent → . + ./contract
  + effects-canvas defaultCanvasInnerShadowEffectRunner absent → . + ./contract
  + effects-canvas registerCanvasBevelEffect absent → . + ./contract
  + effects-canvas registerCanvasCompositeEffect absent → . + ./contract
  + effects-canvas registerCanvasGradientBevelEffect absent → . + ./contract
  + effects-canvas registerCanvasGradientGlowEffect absent → . + ./contract
  + effects-canvas registerCanvasInnerGlowEffect absent → . + ./contract
  + effects-canvas registerCanvasInnerShadowEffect absent → . + ./contract
  Review the moves, then run npm run reachability:baseline to accept the curated lane placement.
```

`scripts/reachability-baseline.json` tracks scene2d-dom renderer and registrar reachability, including
the contract-only `defaultDomRenderCacheRenderer` and `defaultDomScene2DRenderer`, but contains none of
the CSS-filter symbols. The check's silence before and after the repair is therefore a coverage hole,
not evidence that the old placement had been deliberately accepted. The unrelated `effects-canvas`
changes were not baselined.
