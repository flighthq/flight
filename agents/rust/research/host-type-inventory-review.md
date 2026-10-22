# Host type inventory: principal review (D26)

Inventory: `host-type-inventory.json` (builder4, pinned TS a62784923f3b). 25 rows, 24 exclusions, 8 questions. The exclusions are accepted as reasoned (backend-created GPU/GL resources, descriptive options and enums, SDK resource entities, IR vocabulary such as Blob / streams / AbortSignal, ABI ids).

**Representation follows TS.** A TS object type becomes an opaque handle (`{ provider, handle: Arc<dyn Any + Send + Sync> }`); a TS `number` id issued by a provider becomes a numeric newtype with its TS sentinel semantics (D0). Both are host vocabulary.

Answers:
- **Q1 GPUQueue:** prospective; WebGPU reaches it as `device.queue`. Drop the separate row; on native the device handle carries device and queue together.
- **Q2 numeric audio handles:** stay numeric (provider-issued ids, Copy, TS sentinels), moved into host vocabulary.
- **Q3 AudioBuffer:** SDK-defined PCM record (constructed directly; earlier channel-limit ruling). Not host vocabulary; stays in audio.
- **Q4 provider-side-map entities** (InputTargetHandle, WindowResizeTargetHandle, FullscreenTargetHandle, ShortcutTriggerSubscription): stay SDK entities; providers key their native objects by the entity's numeric id (D12).
- **Q5 HTMLElement / HTMLCanvasElement:** HTMLCanvasElement is covered by `NativeSurfaceHandle`. The HtmlView element becomes a named leaf, `NativeViewHandle` (web: HTMLElement; native: a platform view). Renderer-local DOM residues in TS-only packages stay there.
- **Q6 timer handles:** both. The app-loop frame request id becomes a numeric leaf (`FrameRequestHandle`); the Rust `TimerHandle` cancellation closure stays as is and moves with the rest of the seam vocabulary.
- **Q7 attachStream input:** a named leaf, `MediaStreamHandle`, produced by the webcam capability.
- **Q8 FontFace:** split. The host leaf is `FontFaceHandle` (provider + handle); `family` and other metadata stay on font's SDK `FontFace` record, which holds the handle.

Layout confirmed by the user; moves landed.

**Follow-up (2026-10-22):** the layout was confirmed and the moves landed (integration-41061222). `InputIngressSource` (TS `object`, a platform event target such as window, canvas or element, handed to the input-ingress capability) is host vocabulary: an opaque handle in flight-host, keeping its TS name. The table is `agents/host-vocabulary.md`.
