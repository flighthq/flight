# WGPU Flight-Owned Type Spec

_2026-11-05. Reference — the structural picks for Flight-owned WGPU types, derived from a production usage audit._

Read before defining or modifying the Flight-owned WGPU type family. Companion to [platform type ownership](platform-type-ownership.md).

## Shape

60 distinct `GPU*` types referenced across WGPU packages. They decompose into five categories, each with a different Flight-ownership strategy.

## Category 1: Structural picks (9 types, ~50 members total)

These types have member access in production code. Each becomes a Flight-owned structural type (analogous to `GlContext` for GL).

### WgpuDevice (14 members)

```
createBindGroup, createBindGroupLayout, createBuffer,
createCommandEncoder, createPipelineLayout, createRenderPipeline,
createSampler, createShaderModule, createTexture, destroy,
features, limits, lost, queue
```

### WgpuRenderPassEncoder (10 members)

```
draw, drawIndexed, end, setBindGroup, setIndexBuffer,
setPipeline, setScissorRect, setStencilReference,
setVertexBuffer, setViewport
```

### WgpuTexture (6 members)

```
createView, destroy, dimension, format, height, width
```

### WgpuBuffer (5 members)

```
destroy, getMappedRange, mapAsync, size, unmap
```

### WgpuQueue (4 members)

```
copyExternalImageToTexture, submit, writeBuffer, writeTexture
```

### WgpuCommandEncoder (3 members)

```
beginRenderPass, copyTextureToBuffer, finish
```

### WgpuCanvasContext (3 members)

```
configure, getCurrentTexture, unconfigure
```

### WgpuAdapter (3 members)

```
features, limits, requestDevice
```

### WgpuGpu (2 members — entry point)

```
getPreferredCanvasFormat, requestAdapter
```

## Category 2: Opaque handle types (8 types)

Created by `device.create*()`, stored, and passed to `pass.set*()` or descriptor fields. No member is ever accessed. These become opaque type aliases — a native backend returns its own opaque handle, Flight code stores and passes it.

```
WgpuBindGroup, WgpuBindGroupLayout, WgpuRenderPipeline,
WgpuShaderModule, WgpuSampler, WgpuTextureView,
WgpuPipelineLayout, WgpuCommandBuffer
```

## Category 3: Descriptor types (~20 types)

Plain data objects passed as arguments to `create*()` methods. No methods, no opaque state. These are Flight-defined interfaces directly — the shape is the type.

Heavily used: `WgpuRenderPipelineDescriptor`, `WgpuTextureDescriptor`, `WgpuVertexBufferLayout`, `WgpuBindGroupEntry`, `WgpuBlendState`, `WgpuRenderPassDescriptor`, `WgpuSamplerDescriptor`, `WgpuBufferDescriptor`.

Less used: `WgpuBindGroupLayoutEntry`, `WgpuBindGroupDescriptor`, `WgpuPipelineLayoutDescriptor`, `WgpuDeviceDescriptor`, `WgpuColorTargetState`, `WgpuBlendComponent`, `WgpuStencilFaceState`, `WgpuColor`, `WgpuExtent3D`, `WgpuOrigin3D`, `WgpuTexelCopyTextureInfo`, `WgpuTexelCopyBufferLayout`.

## Category 4: String union types (~15 types)

TypeScript string unions used in descriptors. Same string values on native wgpu — these are portable as-is and can be re-exported under Flight names.

Heavily used: `WgpuTextureFormat` (70 refs), `WgpuFilterMode` (15 refs), `WgpuDeviceLostReason` (12 refs), `WgpuFeatureName` (7 refs).

Standard set: `WgpuMipmapFilterMode`, `WgpuBlendFactor`, `WgpuBlendOperation`, `WgpuStencilOperation`, `WgpuLoadOp`, `WgpuIndexFormat`, `WgpuPrimitiveTopology`, `WgpuAddressMode`, `WgpuCanvasAlphaMode`, `WgpuPowerPreference`, `WgpuBufferMapState`.

## Category 5: Constant namespaces (5 types)

Static flag bitmasks accessed as `GPUBufferUsage.VERTEX`. These become Flight-owned constant objects.

```
WgpuBufferUsage:   COPY_DST, INDEX, MAP_READ, STORAGE, UNIFORM, VERTEX
WgpuTextureUsage:  COPY_DST, COPY_SRC, RENDER_ATTACHMENT, TEXTURE_BINDING
WgpuShaderStage:   FRAGMENT, VERTEX
WgpuColorWrite:    ALL
WgpuMapMode:       READ
```

## Portability concern: texture upload source

`GPUCopyExternalImageSource` accepts `ImageBitmap`, `HTMLCanvasElement`, `HTMLVideoElement`, `VideoFrame`, `OffscreenCanvas`, `ImageData`. On native, wgpu uses `ImageCopyTexture` with raw bytes. This is the WGPU equivalent of the GL texture upload seam and needs a Flight-owned abstraction or a host capability for image-to-texture transfer.

## Implementation note

On web, the Flight-owned types can be `Pick<GPU*, ...>` (identical to GlContext's approach). The browser's GPU objects satisfy the structural picks directly. On native (Rust wgpu crate, C++ Dawn), the host backend wraps native objects to present the same structural interface.

The factory pattern (device creates objects, objects are passed to methods) means the type system is naturally decomposed. Unlike GL where one monolithic context owns everything, WGPU's types are already small and well-bounded.
