// flight-lint: conform-skip(createHost, enableHostGuards, explainHost, initializeHost) D26 (user, 2026-10-22; Principal c9773f25): no generic aggregate host; each host provider composes its own host, each feature explains its own group (explain_host_<group>_capabilities) and owns its guards (enable_host_<group>_guards)
// flight-lint: conform-skip(explainHostAudioDevice, explainHostAudioMixer, explainHostImage, explainHostInputIngress, explainHostTextSegmenter, explainHostTextShaper, explainHostVideo) D26 (Principal c9773f25): each per-capability explainer moved to the feature that owns the slot (flight-media, flight-image, flight-input, flight-textsegment, flight-textshaper, flight-video)
// flight-lint: conform-skip(getHostAudioDevice, getHostAudioMixer, getHostBitmapEncode, getHostBitmapReadback, getHostClipboardFormats, getHostDevice, getHostFileSystem, getHostFontLoading, getHostGeolocation, getHostGlyphRasterizer, getHostHaptics, getHostImage, getHostInputIngress, getHostLifecycle, getHostNet, getHostNotificationPermission, getHostPlatform, getHostPowerKeepAwake, getHostPreferences, getHostPreferencesPersistenceQuery, getHostScreenQuery, getHostSensors, getHostSocket, getHostSoftKeyboardInfo, getHostTextSegmenter, getHostTextShaper, getHostVideo, getHostWgpu, hasHostAudioDevice, hasHostAudioMixer, hasHostBitmapEncode, hasHostBitmapReadback, hasHostClipboardFormats, hasHostDevice, hasHostFileSystem, hasHostFontLoading, hasHostGeolocation, hasHostGlyphRasterizer, hasHostHaptics, hasHostImage, hasHostInputIngress, hasHostLifecycle, hasHostNet, hasHostNotificationPermission, hasHostPlatform, hasHostPowerKeepAwake, hasHostPreferences, hasHostPreferencesPersistenceQuery, hasHostScreenQuery, hasHostSensors, hasHostSocket, hasHostSoftKeyboardInfo, hasHostTextSegmenter, hasHostTextShaper, hasHostVideo, hasHostWgpu) D26 (Principal c9773f25): the generic capability queries are removed; a provider's capability is a field access on its own host
//! The bottom host vocabulary (D26; TS `@flighthq/host` as the bottom vocabulary): every type the SDK
//! uses but does not define, because a host provides it. It holds the opaque platform handles and
//! provider-issued numeric ids, the shared seam vocabulary (`ProviderRef`, the timer and spawn
//! capabilities), and the explanation records (`BackendExplanation`, `BackendOperationExplanation`,
//! `HostExplanation`). It depends on nothing else in the SDK. Capability contracts stay with the
//! feature that owns them (D8), and there is no aggregate host: each host provider composes its own.

mod backend_explanation;
mod backend_operation_explanation;
mod enable_host_guards;
mod host;
mod host_explain;
mod host_explanation;
mod host_query;
mod host_spawn_capability;
mod host_timer_capability;
mod input_ingress_source;
mod numeric_handles;
mod platform_handles;
mod provider_ref;

pub mod contract;

// Public lane: the source files are public types with no runtime `index.ts`, so every type, the D9e
// string tables and the slot explanation builder are exported at the root, as in `contract`.
pub use contract::AudioBufferHandle;
pub use contract::AudioBusNodeHandle;
pub use contract::AudioDeviceHandle;
pub use contract::AudioMixerGraphHandle;
pub use contract::AudioSourceHandle;
pub use contract::BackendExplanation;
pub use contract::BackendExplanationLayer;
pub use contract::BackendExplanationViability;
pub use contract::BackendOperationExplanation;
pub use contract::BackendOperationExplanationLayer;
pub use contract::Canvas2DContext;
pub use contract::CanvasRenderingContext2D;
pub use contract::CanvasTextMetrics;
pub use contract::FontFaceHandle;
pub use contract::FrameRequestHandle;
pub use contract::GlContext;
pub use contract::HostCapabilityBackend;
pub use contract::HostCapabilityCoverage;
pub use contract::HostCapabilityExplanation;
pub use contract::HostCapabilityGroupExplanation;
pub use contract::HostExplanation;
pub use contract::HostImageSource;
pub use contract::HostSpawnCapability;
pub use contract::HostTimerCapability;
pub use contract::InputIngressSource;
pub use contract::MediaStreamHandle;
pub use contract::NativeSurfaceHandle;
pub use contract::NativeViewHandle;
pub use contract::NativeWindowHandle;
pub use contract::ProviderRef;
pub use contract::TimerHandle;
pub use contract::WgpuDevice;
pub use contract::WgpuSurfaceContext;
pub use contract::explain_host_capability_slot;
pub use contract::get_backend_explanation_layer_string;
pub use contract::get_backend_explanation_viability_string;
pub use contract::get_backend_operation_explanation_layer_string;
pub use contract::parse_backend_explanation_layer;
pub use contract::parse_backend_explanation_viability;
pub use contract::parse_backend_operation_explanation_layer;
