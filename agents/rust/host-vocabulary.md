# Host Vocabulary

The platform half of the transpiler vocabulary (D26). `ir-vocabulary.md` maps language constructs; this table maps the objects a host provides and the SDK does not define. Every type here lives in `flight-hostcapability`, is an opaque handle (`{ provider: ProviderRef, handle: Arc<dyn Any + Send + Sync> }`), and is narrowed only by the backend that consumes it.

Status: **skeleton.** Rows are filled from the host-type inventory (plan.md, "Host vocabulary (D26) work") after principal review.

| Rust (flight-hostcapability) | TS | C++ | Haxe | Narrowed by | Provided by (host seam) |
|---|---|---|---|---|---|
| `CanvasRenderingContext2D` | `CanvasRenderingContext2D` | (TS-only path; native: tiny-skia / Cairo surface, D19) | `js.html.CanvasRenderingContext2D` | scene2d-canvas (TS) | `HostCanvasCapability` |
| `GlContext` | `WebGL2RenderingContext` | EGL / SDL GL context + loader | `js.html.webgl.GL2` | render-gl → `glow::Context` | `HostGlCapability` |
| `WgpuDevice`, `WgpuQueue`, `WgpuSurfaceContext` | `GPUDevice`, `GPUQueue`, `GPUCanvasContext` | `wgpu::Device` etc. (Dawn / wgpu-native) | (open) | render-wgpu → `wgpu::*` | `HostWgpuCapability` |
| `NativeSurfaceHandle` | `NativeSurfaceHandle` | window / drawable handle | (open) | host-* | `HostGlCapability.create`, `HostWgpuCapability.create`, `HostCanvasCapability` |
