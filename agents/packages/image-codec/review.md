---
package: '@flighthq/image-codec'
status: solid
score: 70
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# image-codec — Review

**Verdict:** solid — 70/100. The blessed Bronze scope (2026-07-09 Decisions) is fully shipped and clean: DOM-free MIME-keyed registries, null-sentinel dispatchers with auto-detection, the migrated sniffer, and opt-in web registrars — 7 source files, 7 colocated test files, 38 tests. What keeps it out of solid-high is within-scope polish: the sniffer cannot detect a format the web decoder registers (AVIF), no registry enumeration, no `explain*` diagnostics for the silent sentinels, and a silent-fallback hazard in the web encoder.

## Present capabilities

- **Registries** (`imageDecoderRegistry.ts`, `imageEncoderRegistry.ts`): global MIME-keyed `Map`s, empty at import, last-write-wins. Full quintet each: `registerImageDecoder`/`getImageDecoder`/`hasImageDecoder`/`unregisterImageDecoder`/`clearImageDecoders` and encoder twins. Matches the 2026-07-09 registry decision exactly.
- **Dispatchers** (`decodeImage.ts`, `encodeImage.ts`): `decodeImage(bytes, mimeType?)` auto-detects via `detectImageMimeType` when the type is omitted; `decodeImagePremultiplied` passes `{ premultiplyAlpha: true }` per the straight-default/opt-in-premultiplied decision; `encodeImage(image, mimeType, options?)` forwards `ImageEncodeOptions`. All return `null` sentinels for unknown type / no registered codec.
- **MIME sniffing** (`detectImageMimeType.ts`): magic-byte detection for PNG, JPEG, GIF, WebP (RIFF+WEBP), BMP; accepts `Readonly<Uint8Array> | ArrayBuffer`; `null` for short/unknown headers. Migrated from `@flighthq/image` per the charter decision — `image` now imports it internally (`packages/image/src/imageResourceFrom.ts`) and does **not** re-export it from its barrel (verified: `packages/image/src/index.ts`), matching the decision.
- **Web decoder registrar** (`registerWebImageDecoders.ts`): one shared `createImageBitmap` → `OffscreenCanvas` → `getImageData` decoder registered under png/jpeg/webp/gif/avif/bmp; `bytes.slice()` detaches from pooled input; JS `premultiplyRgbaInPlace` fallback since `getImageData` is always straight (the status.md judgment call is honored and commented in source).
- **Web encoder registrar** (`registerWebImageEncoders.ts`): per-MIME `convertToBlob({ type, quality })` closures under png/jpeg/webp; copies `image.data` so a `Readonly` input is never aliased into `ImageData`.
- **Types header-first**: `DecodedImage`, `ImageDecoder`, `ImageEncoder`, `ImageDecodeOptions`, `ImageEncodeOptions` all live in `@flighthq/types` (one concept per file), with durable semantic comments on alpha convention and DOM-freedom.
- **Tests**: 38 across 7 files; registries, both dispatch paths (explicit + auto-detect + both null sentinels), premultiply math verified numerically (`[200,100,50,128] → [100,50,25,128]`), sniffer per format including ArrayBuffer input, web registrars via mocked globals.

## Gaps

- **AVIF is registered but unsniffable.** `registerWebImageDecoders` registers `image/avif`, but `detectImageMimeType` has no ISO-BMFF `ftyp` sniff — `decodeImage(bytes)` without an explicit MIME can never dispatch AVIF. The sniff set and the web-decodable set should agree.
- **Sniffer breadth** below a textbook sniffer (WHATWG mime-sniffing image set): no AVIF/HEIC (`ftyp` brands), ICO (`00 00 01 00`), or TIFF (`II*\0` / `MM\0*`).
- **No registry enumeration.** Nothing answers "which MIME types can this runtime decode/encode?" — needed for accept headers, file pickers, and capability probes. A `get*MimeTypes()` pair is the conventional surface.
- **No `explain*` queries.** `decodeImage`/`encodeImage` return silent `null` with two indistinguishable causes (unknown type vs. no codec registered). Per the diagnostics convention every silent sentinel gets a shakeable `explain*` query returning plain data; none exists.
- **Web encoder silent-fallback hazard.** `convertToBlob({ type })` falls back to PNG when the platform cannot encode the requested type (e.g. `image/webp` on some engines); `createCanvasImageEncoder` never checks `blob.type`, so `encodeImage(img, 'image/webp')` can silently return PNG bytes. The `ImageEncoder` contract (`Promise<Uint8Array>`, no failure sentinel) has no channel to report this.
- **No real DOM-free codecs in the SDK yet** — the "DOM-free seam" currently has only DOM-backed implementations. Deliberate: per-format wasm packages are charter Open direction 1, not an in-package gap.
- **No animated/multi-frame decode** (`decodeImageSequence`) — charter Open direction 3, deferred.

## Charter contradictions

None found. The registry shape, sentinel behavior, alpha default, dependency floor (`@flighthq/types` only, verified in package.json), no-import-side-effects, and the detectImageMimeType migration (including the no-re-export ruling) all match the 2026-07-09 Decisions.

## Contract & docs fit

**Package → contract:** clean. Types-first in `@flighthq/types`; unabbreviated self-identifying names (`registerImageDecoder`, `detectImageMimeType`); `null` sentinels, no throws; single root `.` export via a thin barrel; `sideEffects: false` with module state at file bottom; `Readonly<>` on inputs throughout; exported functions alphabetized; free functions only. One convention shortfall: the diagnostics inversion rule (silent sentinels want `explain*` seams) is not yet met — listed above as a gap.

**Docs → package (candidate revisions):**
- **Package Map stale**: `agents/index.md`'s `@flighthq/image` line says it "re-exports `detectImageMimeType` from image-codec" — it does not (no re-export in `packages/image/src/index.ts`), and the charter decision says it must not. The `image` line should drop that clause.
- **status.md self-contradiction** (flag only; status is not mine to edit): the 2026-07-09 entry claims `image` "re-exports it from its barrel (no break for image consumers)", contradicting both the charter decision and current source. It also names the import site `loadImageResourceFromBytes`; the actual site is `imageResourceFrom.ts`.

## Candidate open directions

1. **Encoder failure signaling.** Should `ImageEncoder` be able to report "cannot produce this format" (return-type change to `Promise<Uint8Array | null>` in `@flighthq/types`), or should registrars only register verified-supported types? Needed to close the silent-PNG-fallback hazard; touches the header layer, so it is a decision, not a sweep.
2. **Sniffer parity rule.** Should the charter state that `detectImageMimeType`'s sniff set must cover (at least) every MIME the web registrars register? Today they diverge (AVIF).
3. **Pixel-format breadth.** `DecodedImage` is fixed RGBA8; 16-bit/grayscale/HDR decode is out of the current shape. Fine for now, but the charter does not say whether RGBA8-only is permanent.
4. **EXIF orientation policy.** `createImageBitmap` applies `imageOrientation: 'from-image'` by default in modern browsers; whether decoded pixels are orientation-applied is unstated in the contract.
