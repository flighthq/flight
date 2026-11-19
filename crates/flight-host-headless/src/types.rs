// flight-lint: allow-file(contract-vocabulary) native host: the host value carries native wgpu values and Rust callback forms of the capability closures it fills

use flight_host::{ProviderRef, WgpuDevice};
use flight_render_wgpu::WgpuNativeDevice;
use flight_surface::HostWgpuCapability;

/// The graphics APIs a headless host may open an adapter on. Each is also gated by the platform:
/// Vulkan on Linux and Windows (and through a portability layer on Apple platforms), Metal on Apple
/// platforms, DirectX 12 on Windows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeadlessHostBackends {
    pub dx12: bool,
    pub metal: bool,
    pub vulkan: bool,
}

/// Why `create_headless_host` would return `None`, or `Ready` when it would succeed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum HeadlessHostExplanationReason {
    Ready = 0,
    NoAdapter = 1,
    SoftwareAdapterRejected = 2,
    DeviceRequestFailed = 3,
}

/// Plain-data answer to "why did creating a headless host fail?". `adapter_*` describe the adapter
/// the host chose (empty when none was chosen); `message` carries the platform's own words for a
/// failed device request.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HeadlessHostExplanation {
    pub adapter_backend: String,
    pub adapter_name: String,
    pub message: String,
    pub reason: HeadlessHostExplanationReason,
}

/// A windowless native host: one real wgpu device on a chosen adapter, and the capabilities and
/// carriers the SDK's wgpu path borrows from it. Plain host data, not an Entity. The host owns the
/// device; render states, surfaces and targets built over it borrow it and must be released by
/// their own verbs before `destroy_headless_host`.
pub struct HeadlessHost {
    pub(crate) adapter_backend: String,
    pub(crate) adapter_name: String,
    pub(crate) destroyed: bool,
    pub(crate) device: WgpuDevice,
    pub(crate) native: WgpuNativeDevice,
    pub(crate) provider: ProviderRef,
    pub(crate) software_adapter: bool,
    pub(crate) wgpu: HostWgpuCapability,
}

/// How a headless host chooses its adapter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeadlessHostOptions {
    /// Whether a CPU (software) adapter such as Mesa lavapipe or WARP is acceptable. It is chosen
    /// only when no hardware adapter is available on the selected backends.
    pub allow_software_adapter: bool,
    pub backends: HeadlessHostBackends,
    pub power_preference: HeadlessHostPowerPreference,
}

/// Which hardware adapter to prefer when several are available.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum HeadlessHostPowerPreference {
    None = 0,
    LowPower = 1,
    HighPerformance = 2,
}
