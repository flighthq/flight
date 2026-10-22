# flight-host

The bottom host vocabulary (D26). It holds every type the SDK uses but does not define, because a
host provides it, and it depends on nothing else in the SDK, so these types thread through every
layer.

- **Opaque platform handles** (`{ provider: ProviderRef, handle: Arc<dyn Any + Send + Sync> }`;
  the `Arc` identity of `handle` is the platform object's identity, narrowed only by the backend
  that consumes it): `NativeWindowHandle`, `NativeSurfaceHandle`, `NativeViewHandle`,
  `CanvasRenderingContext2D`, `GlContext`, `WgpuDevice`, `WgpuSurfaceContext`, `HostImageSource`,
  `FontFaceHandle`, `MediaStreamHandle`, `InputIngressSource`. Where TS allows the object to be
  null, the SDK field is an `Option` of the handle.
- **Provider-issued numeric ids** (`Copy` newtypes): the audio buffer, device, source, bus-node and
  mixer-graph handles, keeping their TS sentinels, and the app loop's `FrameRequestHandle`, which
  reserves no value (a pending-request slot that may be empty is an `Option`).
- **Shared seam vocabulary**: `ProviderRef`, `HostTimerCapability` / `TimerHandle` and
  `HostSpawnCapability`.
- **Explanation records**: `BackendExplanation` and `BackendOperationExplanation` (with their D9e
  string tables), and `HostExplanation` with its coverage, group, slot and backend records.
  `explain_host_capability_slot` builds one slot's explanation for a feature's explainer.

There is no aggregate host. Capability contracts stay with the feature that owns them (D8), and each
feature explains its own capability groups (`explain_host_<group>_capabilities`) and owns its guards
(`enable_host_<group>_guards`). A `host-*` provider composes its own host value from the groups it
supports.
