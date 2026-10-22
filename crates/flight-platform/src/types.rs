use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_host::ProviderRef;

/// The specific OS/runtime name (TS `PlatformName`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlatformName {
    Web,
    Windows,
    MacOs,
    Linux,
    Ios,
    Android,
    #[default]
    Unknown,
}

/// Host CPU byte order as probed from the runtime (TS `PlatformEndianness`; 'unknown' when unprobeable).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlatformEndianness {
    Big,
    Little,
    #[default]
    Unknown,
}

/// Browser layout/JS engine family (TS `PlatformEngine`; 'unknown' for native or unrecognized hosts).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlatformEngine {
    Gecko,
    Blink,
    Webkit,
    #[default]
    Unknown,
}

/// The platform family (TS `PlatformKind`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlatformKind {
    Desktop,
    Mobile,
    Web,
    #[default]
    Unknown,
}

/// Host shell / runtime environment wrapping the page (TS `PlatformRuntime`; 'web' for a plain browser, 'native' for a non-web-shell native host, 'unknown' off-DOM).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PlatformRuntime {
    Web,
    Electron,
    Tauri,
    Capacitor,
    Native,
    #[default]
    Unknown,
}

/// The running platform's identity (TS `PlatformInfo extends Entity`), written into a caller-owned
/// `out` by `get_platform_info`. Unknown values are empty strings, the `Unknown` enum variants, false,
/// and -1, as the source's initializer sets them. The
/// entity slot is `entity_runtime`, since `runtime` is the TS host-shell field.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PlatformInfo {
    entity_runtime: EntityRuntimeSlot,
    pub name: PlatformName,
    pub kind: PlatformKind,
    /// OS version string when the host reports one, else "". Compared only by
    /// `compare_platform_versions`.
    pub version: String,
    /// CPU architecture ("x64", "arm64", ...) when known, else "".
    pub arch: String,
    /// BCP-47 locale tag, e.g. "en-US"; "" when unknown.
    pub locale: String,
    /// Whether the primary input is touch.
    pub is_touch: bool,
    /// Host shell / runtime environment wrapping the page.
    pub runtime: PlatformRuntime,
    /// Browser layout/JS engine family; `Unknown` on native hosts with no browser engine.
    pub engine: PlatformEngine,
    /// Browser engine version string when known, else "".
    pub engine_version: String,
    pub endianness: PlatformEndianness,
    /// Pointer/word width in bits inferred from the architecture: 32, 64, or -1 when unknown (TS
    /// numeric literal union `32 | 64 | -1`).
    pub pointer_width: i32,
    /// OS build identifier when a native host reports one, else "".
    pub os_build: String,
    /// Linux distribution id (e.g. "ubuntu") when a native host reports one, else "".
    pub distro: String,
    /// Linux distribution version when a native host reports one, else "".
    pub distro_version: String,
}

/// The root environment-identification capability (TS `HostPlatformCapability`): fills `out` with the
/// platform identity. Plain dispatch data; `provider` is the provider object identity.
#[derive(Clone)]
pub struct HostPlatformCapability {
    pub provider: ProviderRef,
    pub get_info: Arc<dyn Fn(&mut PlatformInfo) + Send + Sync>,
}

/// Host platform capability group (TS `HostPlatformCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostPlatformCapabilities {
    pub info: Option<HostPlatformCapability>,
}

// The entity runtime slot is named `entity_runtime` because the TS `runtime` field (the host shell,
// `PlatformRuntime`) keeps its source name; `impl_entity!` assumes a slot named `runtime`, so the
// Entity impl is written out, with the same two accessors the macro generates.
// flight-lint: allow(sugar-delegates) trait boilerplate: the Entity accessors impl_entity! would generate, written out because the slot is not named `runtime`
impl flight_entity::Entity for PlatformInfo {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.entity_runtime;
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.entity_runtime;
    }
}
