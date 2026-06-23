# Filename Alignment: @flighthq/render

**Verdict:** Single-implementation core package (NOT a backend variant — no backend prefix applies); filenames are consistently domain/object-named and clean, with only two thin single-function files worth noting.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `renderColor.ts` | Holds one function (`setRenderStateBackgroundColor`). "renderColor" is a thin domain name — the file is really about the render state's background color, not a color subsystem. Borderline; passes the "names a domain not a function" test, but the domain barely exists. | Acceptable as-is. If it grows beyond background color, keep `renderColor.ts`; if it stays a lone setter, consider folding into `renderState.ts` (the object it mutates) rather than renaming. |
| `renderTextFormat.ts` | Holds one function (`computeTextFormatFontString`), which computes a CSS font string from a `TextFormat`. Filename names the domain (text format in the render layer), so it passes the test, but it is a single-function file. | Acceptable as-is — `renderTextFormat` is a legitimate domain/object name (operates over `TextFormat`). No rename needed unless it stays a permanent one-liner, in which case relocation to a text-render concern is the only lever. |

## Clean

- `index.ts` — barrel re-export; appropriate.
- `renderAppearance.ts` — names the appearance-update domain over `RenderProxy`; single export but domain-named (passes the test).
- `renderCache.ts` — `RenderCache` / `RenderCacheAdapter` object domain; multiple exports.
- `renderMaterial.ts` — material-update domain over `RenderProxy`; domain-named.
- `renderProxy.ts` — the `RenderProxy` object domain; many exports.
- `renderProxyAdapter.ts` — the `RenderProxyAdapter` object domain.
- `renderState.ts` — the `RenderState` object domain.
- `renderTarget.ts` — render-target domain (size/transform helpers).
- `renderTransform2d.ts` — 2D render-transform domain.
- `renderer.ts` — `Renderer` object + registration domain.
- `sceneRender.ts` — 3D scene-render domain.

No generic dumping-ground names (no `data.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`, `format.ts`, `query.ts`). Every source has a colocated `<source>.test.ts` mirroring its filename.
