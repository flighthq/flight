# flight-render-wgpu

The WebGPU render backend (TS `@flighthq/render-wgpu`), built on host-supplied native `wgpu`
devices (D17). It does not discover adapters or create devices itself. A host hands it a
`flight_host::WgpuDevice` whose handle holds a `WgpuNativeDevice`; any other payload panics by
name. The host builds that payload with `create_wgpu_native_device(device, queue, host_spawn)`,
which registers wgpu's lost callback at construction and stores the device's loss promise (TS
`GPUDevice.lost`, D20). A host that reports loss itself uses
`create_wgpu_native_device_with_loss_hook` and settles it with `resolve_wgpu_device_loss`. Loss
observers run as continuations on the host's `HostSpawnCapability`, after the current synchronous
code.

- **Render states and device tiers.** `create_wgpu_render_state` builds a state on a device.
  `create_wgpu_offscreen_render_state` derives a device-only state that shares the parent's device
  tier and snapshots its registrations; a lost device is reported, not panicked.
  `destroy_wgpu_render_state` takes the caller's proxy store and runs state teardowns, then device
  teardowns when the last state on the tier goes.
- **Frames and passes.** A frame records into one command encoder and submits once
  (`begin_wgpu_frame` / `submit_wgpu_frame`). Retired buffers and textures are destroyed only after
  that submit. `with_wgpu_frame_borrow` lends the open frame to a state on the same device and gives
  it back even when the callback panics. `begin_wgpu_render_pass` returns a `WgpuRenderPass` that
  borrows the state, so nested passes close innermost first by construction. Ending a nested pass
  resumes the enclosing one with load. `suspend_wgpu_render_pass` and `resume_wgpu_render_pass`
  give a caller the encoder between them.
- **Screen targets.** `create_wgpu_screen_render_target` attaches a surface through the host's
  `HostWgpuCapability`. The surface context narrows to `Arc<dyn WgpuCanvasContext>`, which is
  implemented for `wgpu::Surface<'static>`. The target holds the acquired frame lease and presents
  it exactly once, after the frame's submit.
  - Timeout and Outdated skip the frame; Outdated also reconfigures before the next acquire.
  - Lost takes the device-lost path.
  - Opt-in 2x supersampling: `enable_wgpu_screen_render_target_antialias`.
  - Opt-in capture to a `Bitmap`: `enable_wgpu_screen_render_target_capture` and
    `create_bitmap_from_wgpu_screen_render_target`. Rows are padded to 256 bytes and BGRA is
    swizzled to RGBA; the map has a timeout.
- **Texture targets and render textures.** Texture render targets, a pool of them, and render
  textures whose hidden targets are cached per device tier by entity id (D12), with an honest
  readiness status and an optional guard. `with_wgpu_render_textures` leases textures from a
  `WgpuRenderTexturePool` and releases them even on panic.
- **Texture realization.** `resolve_wgpu_texture` dispatches on the source kind:
  - bitmaps, by content version, in premultiplied/straight and sRGB/linear caches;
  - host images, through the external copy;
  - render textures, external textures and opt-in compressed images. Compressed containers
    upload natively when the device enables BC, ETC2 or ASTC, or fall back to a CPU decoder.

  `register_wgpu_mipmap_generation` renders mip chains on the GPU.
  `enable_wgpu_texture_resolver_guards` adds registry-miss guards and a once-only
  mipmap-degradation warning.
- **Drawing.** Immediate textured quads, a fullscreen-pass primitive and scissor stacks, plus
  per-node and state-wide bitmap shaders and the quad material renderer table. The WGSL is the
  source text verbatim and is validated by naga.

Host images narrow to `Arc<dyn WgpuExternalImageSource>`, native wgpu's stand-in for
`copyExternalImageToTexture`. A source reports its size and readiness and copies into a texture.
`NotReady` and `CopyFailed` mean "retry later"; any other copy error panics.

Registry slots for values owned by packages that are not ported yet hold opaque `UnknownValue`s:
effects, passes, mesh material renderers, modifier snippets, GPU skinning, velocity writers, the
shape rasterizer and the color-adjustment feature.

Tests run on real `wgpu` devices on the noop backend. `tests/support.rs` holds the Rust versions
of the source's browser scaffolding: a test host, a canvas-context fake and a host-image fake.
