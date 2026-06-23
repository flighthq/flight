# Filename Alignment: @flighthq/displayobject-dom

**Verdict:** This is a backend-variant package (`-dom`), so the prefix-first rule applies — every source file must lead with the `dom` backend token. Coverage is strong (24 of 25 files comply), but one file drops the prefix (`htmlView.ts`), one is named after a single function with a generic "Helpers" suffix (`domTextHelpers.ts`), and one has a `CSS`/`Css` casing mismatch against every identifier in the package (`domCSSFilterBinding.ts`).

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `htmlView.ts` | Missing the mandatory `dom` backend prefix. Exports `drawDomHtmlView` + `defaultHtmlViewRenderer`; the file is a DOM leaf renderer and reads like a different package without the token. Sits out of order from its `dom*` siblings in a directory listing. | `domHtmlView.ts` |
| `domTextHelpers.ts` | Named after one function (`escapeHtmlString` is the sole export) with the generic dumping-ground suffix "Helpers" — carries no domain. The bare name does not say what it operates over. | `domHtmlString.ts` (object it escapes) — or fold `escapeHtmlString` into `domHtmlView.ts`, its primary consumer, if it stays a single helper |
| `domCSSFilterBinding.ts` | Casing mismatch: filename uses `CSS` but all 28 identifier uses in the package are `Css` (`getDomCssFilter`, `enableDomCssFilterSupport`, `DomCssFilterSupport`, …). The filename should mirror the type/domain spelling. "Binding" is also a soft, near-generic tail; the file's domain is the CSS filter itself. | `domCssFilter.ts` |

## Clean

These files name a clear domain/object and lead with the `dom` prefix as required:

- `domBackground.ts`
- `domBitmap.ts`
- `domCache.ts`
- `domClip.ts`
- `domClipContours.ts`
- `domClipRectangle.ts`
- `domDisplayObject.ts`
- `domFontSource.ts`
- `domMaterials.ts`
- `domNativeText.ts`
- `domReconcile.ts`
- `domRenderState.ts`
- `domRenderView.ts`
- `domRichText.ts`
- `domScale9Mapper.ts`
- `domScale9Shape.ts`
- `domShape.ts`
- `domStyle.ts`
- `domTextInput.ts`
- `domTextLabel.ts`
- `domTransform.ts`
- `domVideo.ts`
- `index.ts` (barrel; exempt)

All sources have a colocated `<source>.test.ts` mirror.
