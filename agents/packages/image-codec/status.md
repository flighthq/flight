---
package: '@flighthq/image-codec'
updated: 2026-08-08
by: principal
---

# image-codec — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/image-codec/src/` on 2026-08-08. Registry enumeration and the diagnostics
seam are both present and reachable on the public lane (`imageDecoderRegistry.ts:13`,
`explainImageDecodeFailure.ts:8`, `explainImageEncodeFailure.ts:7`), so what follows is what is not
here.

- **`@flighthq/image` does not re-export `detectImageMimeType`.** The migration's "no break for image
  consumers" is untrue today: neither `packages/image/src/index.ts` nor its `contract.ts` carries any
  codec name; `image` imports the function for its own use at `imageResourceFrom.ts:2` and stops there.
  A consumer that used to reach it through `image` must now depend on `@flighthq/image-codec`.
- **The registration key does not constrain what actually decodes.** One shared decoder is registered
  under every browser-decodable MIME type (`registerWebImageDecoders.ts:9`), and it builds its `Blob`
  with no `type` (`:23`), so `createImageBitmap` sniffs the format from the bytes — registering under
  `image/png` will happily decode a JPEG. Encoders are the asymmetric case and close over their MIME
  type, because `convertToBlob` must name the output format.
- **Premultiplied decode costs a second pass.** `getImageData` is always straight, so
  `premultiplyAlpha` decodes straight and then premultiplies in JS (`registerWebImageDecoders.ts:31`,
  `:37`). A wasm codec could produce premultiplied output directly.
- **Three deferred directions are still unbuilt**: per-format wasm codec packages (no
  `packages/image-codec-*` exists), off-thread decode (no worker anywhere in `src/`), and animation —
  `decodeImageSequence` plus a spritesheet bridge (no such export).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified against source and converted to the Open + Log contract; the claim that
  `@flighthq/image` re-exports `detectImageMimeType` from its barrel is **false** and is now recorded
  as open rather than as a completed migration.
- **2026-07-31** — Symmetric `getImageDecoderMimeTypes` / `getImageEncoderMimeTypes` return
  insertion-ordered snapshots, so a caller can inspect runtime capability without a mutable registry
  view (`9b3ab49da`).
- **2026-07-31** — MIME sniffing widened: AVIF `avif`/`avis` brands read from a bounded ISO-BMFF `ftyp`
  box including compatible brands, plus ICO and both TIFF byte orders (`bd2c1a778`).
- **2026-07-09** — First build: DOM-free byte↔pixel seam over `@flighthq/types` alone — MIME-keyed
  decoder/encoder registries empty at import, `decodeImage` / `decodeImagePremultiplied` / `encodeImage`
  returning `null` for an unknown type, and opt-in web codecs over `createImageBitmap` / `OffscreenCanvas`.
- **2026-07-09** — `detectImageMimeType` moved here from `@flighthq/image`, which gained an
  `image-codec` dependency; its detection tests moved with it.
- **2026-07-02** — Blessed as a neighbor package and named `image-codec`, not `image-formats`: this is a
  codec operation, not a data-format parse.
