# Host Vocabulary

The platform half of the transpiler vocabulary (D26). `ir-vocabulary.md` maps language constructs; this table maps the objects a host provides and the SDK does not define. Every type here lives in `flight-host`, the bottom crate (no SDK dependencies), exported from the root and `contract`. Inventory and review: `agents/research/host-type-inventory*`.

**Representation follows TS.**
- A TS object type is an **opaque handle**, `{ provider: ProviderRef, handle: Arc<dyn Any + Send + Sync> }`. `Arc` identity is the platform object's identity. The SDK retains and passes it; only the consuming backend narrows it. A null TS value is `Option<Handle>`.
- A provider-issued TS `number` id is a **numeric Copy newtype** with the TS sentinel.

C++ and Haxe columns are filled when those targets are designed; `(open)` means not yet decided, never guessed.

## Opaque platform handles

| Rust (flight-host) | TS | C++ | Haxe | Narrowed by | Provided by (host seam) |
|---|---|---|---|---|---|
| `NativeWindowHandle` | `NativeWindowHandle` (web: `Window` / document; Electron: `BrowserWindow`) | SDL / platform window handle | (open) | host-* | `HostWindowAttachCapability` (app) |
| `NativeSurfaceHandle` | `NativeSurfaceHandle` (web: `HTMLCanvasElement`) | window drawable / EGL native window | (open) | host-*, render backends | `HostCanvasCapability.create`, `HostGlCapability.create`, `HostWgpuCapability.create` (surface) |
| `NativeViewHandle` | `HTMLElement` of an HtmlView | platform view / webview | (open) | scene2d-dom (TS), host-* | HtmlView content (scene2d) |
| `CanvasRenderingContext2D` | `CanvasRenderingContext2D` | (TS-only path; native 2D is tiny-skia / Cairo, D19) | `js.html.CanvasRenderingContext2D` | scene2d-canvas, effects-canvas (TS) | `HostCanvasCapability.acquire` (surface) |
| `GlContext` | `WebGL2RenderingContext` | EGL / SDL GL context + loader | `js.html.webgl.GL2` | render-gl → `glow::Context` (built on the GL thread, D17) | `HostGlCapability.acquire` (surface) |
| `WgpuDevice` | `GPUDevice` (queue via `device.queue`) | `wgpu::Device` + queue (Dawn / wgpu-native) | (open) | render-wgpu → `wgpu::Device`, `wgpu::Queue` | `HostWgpuCapability.acquire` (surface) |
| `WgpuSurfaceContext` | `GPUCanvasContext` | `wgpu::Surface` (configured) | (open) | render-wgpu → `wgpu::Surface` | `HostWgpuCapability.attachSurface` (surface) |
| `HostImageSource` | `HostImageSource` / `CanvasImageSource` | decoded native image / texture source | (open) | bitmap, texture uploaders, render backends | `HostImageCapability` (image), `HostVideoCapability` (video) |
| `FontFaceHandle` | `FontFace` (CSS Font Loading API object) | HarfBuzz / FreeType face (D19) | (open) | font, textshaper providers | font loading capability (font); SDK `FontFace` = `{ handle, family }` |
| `MediaStreamHandle` | `MediaStream` | camera stream | (open) | video | webcam capability; consumed by `HostVideoCapability.attachStream` |
| `InputIngressSource` | `InputIngressSource` (`object`; web: an `EventTarget` such as window, canvas or element) | platform event source | (open) | host-* | `HostInputIngressCapability.attach*` (input) |

## Provider-issued numeric ids

| Rust (flight-host) | TS | Sentinel | Provided by |
|---|---|---|---|
| `AudioBufferHandle(i32)`, `AudioSourceHandle(i32)` | `number` | 0 = invalid | audio device / mixer capabilities (media) |
| `AudioDeviceHandle(i32)`, `AudioBusNodeHandle(i32)`, `AudioMixerGraphHandle(i32)` | `number` | as TS | audio device / mixer capabilities (media) |
| `FrameRequestHandle(i32)` | `number` from `requestAnimationFrame` | none reserved; "no request" (TS `null`) is `Option::None` | `HostAppLoopCapability.requestFrame` (app) |

## Seam vocabulary (also in flight-host)

`ProviderRef`, `HostTimerCapability`, `TimerHandle` (cancellation closure), `HostSpawnCapability`, the `Backend*Explanation` and `Host*Explanation` / coverage records, and `explain_host_capability_slot`. Their language mappings are rows in `ir-vocabulary.md`.

## Not host vocabulary (review decisions)

`AudioBuffer` (SDK PCM record); SDK entities that providers key by entity id (`InputTargetHandle`, `WindowResizeTargetHandle`, `FullscreenTargetHandle`, `ShortcutTriggerSubscription`); backend-created GPU / GL resources (buffers, textures, pipelines), which belong to the renderers; descriptive options and enums; IR vocabulary (`Blob`, `ArrayBuffer`, streams, `AbortSignal`).
