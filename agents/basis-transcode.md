---
feature: "Basis-Universal texture transcode"
draft: true
lastDirection: 2026-07-19
spans: ["@flighthq/texture-formats", "@flighthq/render-gl", "@flighthq/types"]
---

# Basis-Universal Texture Transcode — Spec

> **SPEC ONLY — not built.** This charter fixes the seam shape so the compressed-texture upload path
> can reach Basis-Universal assets later without reshaping the API. The parser side already lands
> (`parseBasis` in `@flighthq/texture-formats` produces a `TextureContainer` whose `format` is `etc1s`
> or `uastc`), and the GL upload side already treats those two intermediate formats as a hard stop
> (`getGlCompressedTextureFormat` returns -1 for them; `hasGlCompressedTextureFormat` reports them
> unsupported). What is deferred is the transcoder that turns an intermediate Basis payload into a
> concrete BCn/ETC/ASTC (or RGBA) format the GPU accepts. Do not build the WASM transcoder as part of
> the texture stage.

## The problem it solves

A `.basis` file or a BasisLZ-supercompressed KTX2 level stores one device-neutral encoding (`etc1s` —
small, ETC1S-based — or `uastc` — larger, higher quality) that no GPU consumes directly. At upload
time a transcoder reads the intermediate payload and produces the concrete block format the running
device actually supports (BC7 on desktop, ASTC/ETC2 on mobile), or RGBA when none is available. This
is how one shipped asset covers every GPU — the mobile-vs-desktop split `hasGlCompressedTextureFormat`
exposes — without shipping a separate file per format.

## The seam

The transcoder is a **swappable function seam**, not a hard dependency, so the heavy WASM binary never
lands in a bundle that only uploads already-concrete containers. It mirrors the two existing seams the
compressed path already relies on:

- the parse side (`parseBasis` → `TextureContainer`), which stays DOM- and WASM-free, and
- the RGBA decode fallback (`GlCompressedTextureDecoder` in `@flighthq/render-gl`), which is the exact
  shape the transcoder's RGBA branch reuses.

Proposed seam (to live in a new `@flighthq/texture-transcode` package, the WASM sibling of the
pure-data `texture-formats`):

```ts
// The device-side target the transcoder aims for, chosen by the caller from the device's
// GlCompressedTextureSupport (pick the first supported: bc7 → astc4x4 → etc2Rgba → rgba8unorm).
type BasisTranscodeTarget = TextureContainerFormat;

interface BasisTranscoder {
  // Transcode one intermediate level to the target format's block bytes (or rgba8 for 'rgba8unorm').
  // Returns null when this transcoder cannot reach the target, so the caller falls back to RGBA.
  transcodeBasisLevel(
    sourceFormat: 'etc1s' | 'uastc',
    target: BasisTranscodeTarget,
    width: number,
    height: number,
    data: Readonly<Uint8Array>,
  ): Uint8Array | null;
}

// Registration + retrieval, last-write-wins, no module-top-level side effect (parallels set*Backend).
function setBasisTranscoder(transcoder: BasisTranscoder | null): void;
function getBasisTranscoder(): BasisTranscoder | null;
```

## How the upload path consumes it (later)

`uploadGlCompressedTextureContainer` needs no new branch for the concrete-format case. For a Basis
container the caller (not render-gl) resolves the target and pre-transcodes:

1. Detect support once (`detectGlCompressedTextureSupport`).
2. Pick `target` = the best supported concrete format.
3. `transcodeBasisLevel` each level to `target`.
4. Build a concrete `TextureContainer` (its `format` = `target`, levels re-pointed at the transcoded
   bytes) and hand it to `uploadGlCompressedTextureContainer` — the native path uploads it, or the
   `GlCompressedTextureDecoder` RGBA fallback covers a `rgba8unorm` target.

So render-gl stays transcoder-free: it only ever sees concrete containers. The transcode step is a
pre-pass the asset/texture layer runs, keeping the WASM cost opt-in and out of the render core's
bundle. This is why `getGlCompressedTextureFormat` deliberately maps `etc1s`/`uastc` to -1 today — a
Basis container must be transcoded before it reaches the GPU upload, never uploaded as-is.

## Open directions

- Whether the transcoder ships as a `flight-rs`/WASM module or wraps upstream `basis_universal`.
- Cubemap/array/mip fan-out: the seam above is per-level 2D; a multi-face container transcodes each
  `TextureContainerLevel` independently, which the current flat `levels` list already supports.
- A convenience `transcodeBasisContainer(container, payload, support)` that runs steps 2–4 and returns
  a ready concrete container — belongs in `texture-transcode`, not render-gl.
