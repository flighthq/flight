# Platform Type Ownership

_2026-11-05. Architecture record — Flight-owned types for platform-provided APIs, and the composable host seam for rendering._

**Status: RATIFIED 2026-11-05 by the principal.** Read before adding a platform-provided type (WebGL, WebGPU, AudioBuffer, Canvas2D) to a portable package's type surface, or before changing how a renderer references its backend API.

## The rule

If a type originates from a platform and appears in portable code, Flight defines it and a host backend provides it. Renderers, audio pipelines, and image pipelines reference Flight types, never platform types directly.

This follows the existing pattern — `GlContext`, `NativeSurfaceHandle`, `HostImageSource`, and the `Host*Capability` interfaces are all Flight-owned — and extends it to domains where the platform type currently leaks through.

## Inventory

### Already done — no work needed

| Flight type | What it abstracts | Notes |
|---|---|---|
| `GlContext` | `WebGL2RenderingContext` | Structural `Pick<WebGL2, ...>` of the members actually used. On web, IS `WebGL2RenderingContext`. On native, wraps GLES3 via the same API surface. This is the Lime model. |
| `NativeSurfaceHandle` | `HTMLCanvasElement`, `SDL_Window`, etc. | Opaque `unknown`. |
| `HostImageSource` | `CanvasImageSource` | Flight-owned alias; comment says "native ports replace this." |
| `Host*Capability` | Platform capability interfaces | `HostGlCapability`, `HostWgpuCapability`, `HostCanvasCapability`, `HostAudioDecodeCapabilities`, `HostImageCapability`. |
| `WgpuPresentationSurface` | `HTMLCanvasElement` (for WebGPU) | Flight-owned `{width, height}`, deliberately NOT a canvas element. |

### Needs Flight-owned types

**WebGPU types** — `GPUDevice`, `GPUTexture`, `GPURenderPassEncoder`, `GPUTextureFormat`, `GPUCanvasContext`, etc. appear across ~20 type files in `packages/types/Wgpu*.ts` and `packages/render-wgpu/`. Following the `Wgpu` naming convention already used in the SDK (`WgpuDevice`, `WgpuRenderState`), these become Flight-owned structural types: `WgpuDevice`, `WgpuTexture`, `WgpuRenderPassEncoder`, etc. On web they map to the browser `GPU*` types; in Rust they map to the `wgpu` crate types; in C++ they map to Dawn types.

**AudioBuffer** — `packages/audio/` uses the browser's `AudioBuffer` directly, including `new AudioBuffer({...})` construction. Flight defines its own `AudioBuffer` (same name, module-scoped — no `Flight` prefix). On web, a host bridge wraps the Web Audio `AudioBuffer`. On native, Flight owns the PCM data directly.

**Canvas 2D as texture baker** — `CanvasRenderingContext2D` is used in two distinct roles:
1. **Renderer target** (Canvas/DOM renderers) — target-native, correctly scoped, no change needed.
2. **Texture-baking surface inside GL/WGPU renderers** — `ShapeRasterizer`, `GlRichTextOverlay`, `WgpuRichTextOverlay` use Canvas 2D to rasterize text and vector shapes into textures for GPU upload. On native this would be cairo, skia, or Direct2D.

Role 2 is a host capability seam. A `HostRasterizationCapability` (or similar) that provides a 2D drawing surface for texture baking would let GL/WGPU renderers reference a Flight-owned type instead of `CanvasRenderingContext2D` directly.

### Not platform types — no abstraction needed

`Float32Array`, `Uint8Array`, `ArrayBuffer` (portable typed arrays), `Blob`, `ReadableStream`, `AbortSignal` (language runtime types the compiler handles), `HTMLCanvasElement` in renderer-specific code (correctly scoped to target-native packages).

## Portable renderers

GL and WGPU renderers are **portable**, not target-native, for their logic layer. The state management, draw ordering, batching, effect pipeline, and material dispatch are identical across platforms — only the final API calls differ, and those are against Flight-owned types (`GlContext`, `WgpuDevice`/`WgpuTexture`/etc.) that each platform satisfies.

DOM and Canvas renderers are genuinely target-native (they reference browser-specific DOM APIs with no native equivalent).

This means the `target-native` marker on GL/WGPU renderer crates is transitional: once the compiler gains ownership erasure and the Flight-owned WebGPU types are defined, the portable logic can generate from Rust. The target-native layer becomes only the host backend that provides the Flight-owned types.

## Composable host seams for rendering

Context creation (windowing) is a separate seam from API surface (the GL/WGPU profile). They compose:

```
Context creation (windowing)     API surface (profile)
  host-sdl3  ──┐                   host-webgl ──→ GlContext
  host-glfw  ──┼→ raw GL ctx ──→      (WebGL2 over GLES3)
  host-tauri ──┘

  host-web   ─────────────────→ GlContext directly
                                    (IS WebGL2RenderingContext)
```

`host-webgl` provides the `GlContext` (WebGL2 profile) over a native GLES3 context obtained from any windowing host. On web, `host-web` provides `GlContext` directly because the browser's `WebGL2RenderingContext` already satisfies the structural type.

The same model applies to WGPU: `host-wgpu` provides `WgpuDevice`/`WgpuTexture`/etc. over the native wgpu/Dawn device; `host-web` provides them directly from the browser's WebGPU API.

This extends to all platform seams:

| Seam | Flight type | Web provider | Native provider |
|---|---|---|---|
| GL rendering | `GlContext` (done) | browser WebGL2 | GLES3 via host-webgl |
| GPU rendering | `WgpuDevice` etc. (needed) | browser WebGPU | wgpu/Dawn via host-wgpu |
| Audio data | `AudioBuffer` (needed) | bridges to Web AudioBuffer | owns PCM data |
| Texture baking | host rasterization capability (needed) | Canvas 2D | cairo/skia |
| Windowing | `NativeSurfaceHandle` (done) | HTMLCanvasElement | SDL/GLFW window |
| Image decode | `HostImageCapability` (done) | createImageBitmap | stb/platform |
| Audio decode | `HostAudioDecodeCapabilities` (done) | decodeAudioData | platform codecs |

## Naming

No `Flight` prefix. The SDK does not use `Flight` as a general type prefix. Types are named for what they are: `GlContext`, `WgpuDevice`, `AudioBuffer`. The module boundary provides the namespace; the type name provides the identity.

When a Flight type has the same name as a platform type (e.g., `AudioBuffer` vs the Web Audio `AudioBuffer`), the module scope disambiguates. The platform type appears only in host backends (target-native code). Portable code imports the Flight type from its owning package.
