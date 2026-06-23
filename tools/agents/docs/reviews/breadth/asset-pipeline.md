# Breadth Review: Asset & Resource Pipeline Engineer

**Lens:** Whether the package set provides a complete asset pipeline — image/audio/video/font resources, texture atlases, tilesets, spritesheets and their interchange formats, batch/parallel loaders with progress and retry, caching, and media playback — from disk/network all the way to the GPU.

**Coverage: 68/100**

## What a complete SDK owes this perspective

From disk/network to GPU, an asset-pipeline engineer expects:

1. **Resource primitives** for every asset class: image, audio, video, font, plus atlas/tileset descriptors over them.
2. **Source-agnostic loading**: URL, ArrayBuffer, Blob, Base64, data URI, filesystem; format/MIME detection; cross-origin handling.
3. **A loader/queue** with concurrency control, ordering, **progress reporting**, **retry/backoff**, cancellation, and dependency-aware completion (manifest/bundle loading).
4. **Interchange format parsers/serializers** for the tools artists actually use: TexturePacker, Aseprite, Starling for atlases/spritesheets; bitmap-font formats; particle configs.
5. **Atlas/tileset construction** plus runtime **atlas packing** (dynamic bin packing for runtime-generated glyphs/regions).
6. **A caching layer**: dedup by key, reference counting, eviction, GPU-texture residency caching and reuse across frames/backends.
7. **The GPU upload seam**: resource → texture per backend, with mipmaps, filtering, premultiplied alpha, and re-upload on invalidation.
8. **Media playback**: audio/video channels with seek, gain, rate, looping, and lifecycle.
9. **Compressed/GPU-native texture formats** (KTX2/Basis/DDS) for production-size native + WebGL/WebGPU.

## Well covered

- **Resource primitives are complete and orthogonal.** `@flighthq/resources` covers image, audio, video, and font as plain entity types, each with `create*`, `clone*`, `dispose*`, and a full ladder of `load*From{Url,URLs,ArrayBuffer,Blob,Base64}` constructors. The multi-URL variants (`createAudioResourceFromURLs`, `loadFontFromURLs`) give source fallback for free. MIME sniffing (`detectImageMimeType`) and same-origin checks are present. This is a strong, source-agnostic front door.
- **Atlas and tileset descriptors are well-built.** `TextureAtlas` with region add/build helpers (rect/vector/xy overloads, pivots), `Tileset` with `buildTilesetRegions` and `createTilesetFrom{Atlas,ImageResource}`, plus `load*From*` for both. Construction from canvas/bitmap/image-element/resource is all covered.
- **Spritesheet layer with real interchange formats.** `@flighthq/spritesheet` is a genuine animation sub-library (players, animations, frame data, queueing, timeline bridge), and `@flighthq/spritesheet-formats` parses **and serializes** the three formats that matter — TexturePacker, Aseprite, Starling. Round-tripping (parse + serialize with `existing?` merge) is a maturity signal most SDKs skip.
- **Particle interchange exists too.** `@flighthq/particles-formats` parses/serializes Particle Designer (.plist), Spine, and Unity configs — the asset-import story extends beyond images.
- **GPU upload seam is present per backend.** `bindGlTexture`/`createGlTexture`/`updateGlTexture` and the wgpu `*TextureEntry` trio give a clear resource→texture path, and the docs call out per-renderer image render caches (`imageRenderCache`, `glRenderCache`, etc.).
- **Media playback is solid for audio + video.** `@flighthq/media` exposes channel-based play/pause/resume/stop with seek, gain, and playback-rate for both audio and video — the OpenFL `SoundChannel`/`NetStream` equivalent.
- **Rust parity is real for the leaf.** `surface-rs` exists, and texture upload crates (`render-gl`/`render-wgpu` texture entries) port across, so the value-typed asset leaves are on the conformance path.

## Gaps & missing capabilities

- **The loader is too thin for the role.** `@flighthq/loader` is three functions (`createResourceLoader`, `queueResourceLoad`, `startResourceLoad`) over generic `() => Promise<T>` factories. There is **no progress reporting**, **no retry/backoff**, **no cancellation/abort**, **no concurrency cap**, and **no manifest/bundle** concept. For an asset-pipeline engineer this is the single biggest gap — batch loading "with progress & retry" is explicitly part of the lens and is essentially absent. The `enableLoaderSignals`-style progress/complete/error signal group that the architecture pattern would suggest does not appear in the API.
- **No asset cache / registry package.** There is per-renderer _image render caching_ (GPU residency), but no content-addressed **asset cache**: dedup-by-URL/key, reference counting, eviction, and "load once, share everywhere." Today two `loadImageResourceFromUrl` calls for the same URL fetch twice. OpenFL's `Assets`/`AssetCache` and Lime's asset manifest are the feature target here and have no home.
- **No runtime atlas packer.** `resources` can _describe_ atlas regions and _consume_ pre-packed atlases, but there is no dynamic bin-packing to build an atlas at runtime (e.g. for glyph atlases, runtime-generated regions, or coalescing many small textures). This is standard in mature 2D SDKs and is needed by the text/glyph path too.
- **No compressed / GPU-native texture format support.** No KTX2, Basis Universal, DDS, ASTC/ETC2/BC handling anywhere in `resources` or `texture`. For a native-first Rust production target and large WebGL/WebGPU scenes this is a real production gap — everything funnels through `CanvasImageSource`/decoded RGBA, which is memory-heavy and slow to upload.
- **Image decode is browser-DOM-bound.** Loaders return `CanvasImageSource` / wrap `HTMLImageElement`/`ImageBitmap`. There is no codec seam (PNG/JPEG/WebP decode) for the native Rust path or for off-main-thread decode — the docs' backend-seam pattern is applied to platform capabilities but not to image decoding. This weakens the "to GPU" claim outside the browser.
- **No bitmap-font / MSDF font-atlas asset format.** `font` resources cover system/loaded TTF families, but there is no SDF/MSDF or `.fnt`/BMFont atlas pipeline — the canonical GPU-text glyph-asset path. (Shaping/layout is well-designed in `textshaper`/`textlayout`, but the _glyph-atlas asset_ side is unaddressed.)
- **Audio format/streaming depth unclear.** Audio is via `AudioBuffer` (decode-all). No streaming/seek-while-loading for large music tracks, no sprite-sheet audio (audio sprites), and no explicit format negotiation beyond multi-URL fallback.

## Missing or too-thin packages I would expect

- **`@flighthq/asset` (or `assetcache`)** — content-addressed asset registry: load-once dedup by key, reference counting, eviction, and a manifest/bundle loader. This is the missing keystone of the pipeline and the OpenFL `Assets` analogue.
- **A real loader, not a stub** — either grow `@flighthq/loader` or add `@flighthq/loader` features for concurrency limits, progress signals, retry/backoff, cancellation (AbortSignal), and priority. Pair with an `enableLoaderSignals` group per the SDK's signal pattern.
- **`@flighthq/atlas-packer` (or `texture-packer`)** — runtime bin-packing to build `TextureAtlas`/`Tileset` from loose regions; feeds glyph atlases and dynamic content.
- **`@flighthq/texture-formats`** — KTX2 / Basis Universal / DDS / compressed-format decode + the per-backend upload of compressed blocks (the `*-formats` neighbor-package pattern already used by `spritesheet-formats`/`particles-formats` fits perfectly).
- **`@flighthq/image-codec` (backend seam)** — `registerImageDecoder` over swappable PNG/JPEG/WebP backends so the native Rust host and off-thread decode have a path that does not require a DOM `Image`.
- **`@flighthq/font-atlas` (SDF/MSDF + BMFont)** — glyph-atlas generation/loading for GPU text, complementing the existing shaping/layout stack.
- **A `loader-formats` / manifest format** — parse Lime/OpenFL asset manifests and common bundle descriptors so existing projects' asset libraries import directly.

## Verdict

The **descriptor and interchange layers are genuinely strong** — resource primitives, atlas/tileset/spritesheet types, and three-format parse+serialize support (with particle configs too) are more mature than most SDKs at this stage, and the per-backend GPU upload seam plus media channels close the "to GPU" and playback ends respectably. But the **management half of the pipeline is the weak link**: the loader is a three-function stub with no progress/retry/concurrency/cancellation, there is no shared asset cache or dedup registry, no runtime atlas packing, and no compressed/GPU-native texture or DOM-free image-codec path. For a browser demo the set hangs together; for the native-first Rust production target the SDK advertises, the missing codec/compressed-texture and caching/loader infrastructure means it does **not yet** deliver a complete disk/network-to-GPU pipeline. Closing the loader, asset-cache, atlas-packer, and texture-formats gaps would move this from "good descriptors, thin plumbing" to a true AAA asset pipeline.
