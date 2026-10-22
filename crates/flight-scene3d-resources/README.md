# flight-scene3d-resources

Renderer-neutral scene-document URL acquisition and caller-driven resolution of scene texture
references into live image resources: the material texture registry and its listers, the
resource resolver and its streaming, eager-load, retry and reveal passes, coverage explanation,
the opt-in failure guard, and the glTF, OBJ, AWD2, MD2, MD5 and 3DS document loaders.

Host services are explicit (D5): a resolver retains a `Scene3DResourceResolverContext` (the
loader's spawn/timer capabilities, which also drive each request's settle continuation, and the
caller-owned image resolver state), document loads take the transport `NetState`, and the failure
guard takes caller-owned log state and a clock.

## Precision

Public numeric values remain f32. The complete inventory of f64 allowances:

| Item | Reason |
| --- | --- |
| `types.rs::Scene3DResourceFailureClock` | D1: the injected operation clock returns the log contract's millisecond timestamps |
| `enable_scene3d_resource_failure_guards.rs::enable_scene3d_resource_failure_guards` | D1: takes that clock and passes its millisecond timestamp to `log_once` |
