# flight-surface

The drawable surface entity: an opaque, host-owned native handle retained on the entity's private
runtime. Portable layers can attach to a surface without naming a canvas, GL, wgpu or platform type;
per-kind factories add their own context after allocation.

- `NativeSurfaceHandle` is the canonical `Unknown` (TS `NativeSurfaceHandle = unknown`): an integer,
  opaque object, or `null` all stay representable and keep their shared `Arc` identity.
- `Surface` is the base entity with no public data. `SurfaceRuntime { handle }` is stored in the
  entity's private binding (the source `SurfaceRuntime extends EntityRuntime`), so allocation gives
  every surface its own runtime rather than a shared side table.
- `allocate_surface`, `get_surface_handle` and `get_surface_runtime` are the dependency-ready core.

Capability routing for resize/display, per-kind canvas/GL/wgpu factories and the app->surface
`attachWindowRenderState`/`detachWindowRenderState` moves are pending the Principal ruling on the
common surface-callback representation and the render-gl/render-wgpu module ownership; no platform
types, stubs or native contexts are introduced here.
