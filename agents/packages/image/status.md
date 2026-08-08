---
package: '@flighthq/image'
updated: 2026-08-08
by: principal
---

# image — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/image/src/` on 2026-08-08. The backing→source migration is done here —
`ImageBacking` appears nowhere in `packages/`, and `TextureSource` carries `alphaType` and `gamut` on
the base (`packages/types/src/TextureSource.ts:32`, `:34`). What is left is lane shape.

- **The public lane cannot invalidate an image.** `invalidateImageResource` (`imageResource.ts:48`)
  bumps `Image.version`, and the canvas/DOM element caches key on exactly that version
  (`packages/scene2d-canvas/src/canvasBitmapTextureResolver.ts:23`,
  `packages/scene2d-dom/src/domBitmapTextureResolver.ts:22`). It is reachable through `contract.ts`
  only — `index.ts` omits it — so an app importing `@flighthq/image` can construct and mutate a
  resource but cannot make the change repaint. A stale on-screen image is this, first suspect.
- **The backend seam is contract-only too.** `createWebImageBackend` / `getImageBackend` /
  `setImageBackend` (`imageBackend.ts:13`, `:46`, `:54`) are absent from `index.ts`, which diverges
  from the platform-integration shape where `get*Backend` / `set*Backend` / `createWeb*Backend` are the
  public door. Whether that omission is deliberate is unrecorded.
- **Compressed-container GL upload is opt-in, not automatic.** The 2D draw path reads an installed
  handler off the render-state runtime, and nothing installs it until a caller invokes
  `registerGlCompressedImageTextureResolver` (`packages/render-gl/src/glCompressedTexture.ts:215`).
  A `CompressedImage` built by `createCompressedImage` (`imageResource.ts:21`) silently does not draw
  without it.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified against source and converted to the Open + Log contract. The claim that
  the texture-source migration is "further along than the doc's status implies" is **false**:
  `agents/texture-source-model.md` is locked and records M2–M5 as landed, so the doc and the tree agree
  and the note is deleted.
- **2026-08-05** — The backing→source reshape completed on the image side: `ImageBacking` retired,
  `TextureSource` became the model with declared representation kinds, the neutral image-resource-
  reference atoms homed here (`imageResourceReference.ts`) rather than in `scene3d`, and
  `createImageResourceFromBitmap` moved to its output package (`imageResourceFrom.ts:12`).
- **2026-08-05** — GL uploads source-or-data 2D textures through `bindGlImageResourceTexture`; data-only
  images draw directly on canvas/DOM through a version-keyed element cache.
- **2026-08-05** — URL loading takes an `AbortSignal` (`imageResourceFrom.ts:117`) and routes through the
  swappable image backend.
- **2026-06-25** — Extracted from the eliminated `@flighthq/resources` as the most-consumed shard:
  `imageResource` and `imageResourceFrom`, with the types staying in `@flighthq/types`.
- **2026-06-25** — A `flighthq-image` Rust crate mirrored the split; that code no longer lives here.
