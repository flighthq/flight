// flight-lint: allow-file(contract-vocabulary) native host: the host value carries native wgpu values and Rust callback forms of the capability closures it fills

use flight_host::{ProviderRef, WgpuDevice};
use flight_surface::HostWgpuCapability;

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
/// carriers the SDK's wgpu path borrows from it. Plain host data, not an Entity. The host holds one
/// share of the device; render states, surfaces and targets built over it hold their own, so
/// `destroy_headless_host` releases only the host's share and the device is torn down when the last
/// share drops.
pub struct HeadlessHost {
    pub(crate) adapter_backend: String,
    pub(crate) adapter_name: String,
    pub(crate) claim: Option<HeadlessHostClaim>,
    pub(crate) provider: ProviderRef,
    pub(crate) software_adapter: bool,
}

// The host's share of its device: the device carrier and the capability whose closures hold a clone
// of it. `None` once the host is destroyed.
pub(crate) struct HeadlessHostClaim {
    pub(crate) device: WgpuDevice,
    pub(crate) wgpu: HostWgpuCapability,
}

/// How a headless host chooses its adapter. The `allow_*` backend flags name the graphics APIs it
/// may open an adapter on; each is also gated by the platform: DirectX 12 on Windows, Metal on
/// Apple platforms, Vulkan on Linux and Windows (and through a portability layer on Apple).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeadlessHostOptions {
    pub allow_dx12: bool,
    pub allow_metal: bool,
    /// Whether a CPU (software) adapter such as Mesa lavapipe or WARP is acceptable. It is chosen
    /// only when no hardware adapter is available on the allowed backends.
    pub allow_software_adapter: bool,
    pub allow_vulkan: bool,
    pub power_preference: HeadlessHostPowerPreference,
}

/// Why `create_bitmap_from_headless_screen_render_target` would return `None` for a target, or
/// `Ready` when it would return a Bitmap.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum HeadlessReadBackExplanationReason {
    Ready = 0,
    CaptureNotEnabled = 1,
    NoCapturedFrame = 2,
    MapFailed = 3,
}

/// Plain-data answer to "why did reading a headless screen target back fail?". `message` carries
/// the SDK's own words for a failed map (a driver error or the timeout); it is empty otherwise.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HeadlessReadBackExplanation {
    pub message: String,
    pub reason: HeadlessReadBackExplanationReason,
}

/// Which hardware adapter to prefer when several are available.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum HeadlessHostPowerPreference {
    None = 0,
    LowPower = 1,
    HighPerformance = 2,
}
