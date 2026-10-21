mod platform;
mod types;

pub mod contract;

// Public lane: the thirteen functions the pinned TS `index.ts` names, plus the types their
// signatures require and the D9e string tables. `initialize_platform_info` stays in `contract`.
pub use contract::HostPlatformCapabilities;
pub use contract::HostPlatformCapability;
pub use contract::PlatformEndianness;
pub use contract::PlatformEngine;
pub use contract::PlatformInfo;
pub use contract::PlatformKind;
pub use contract::PlatformName;
pub use contract::PlatformRuntime;
pub use contract::compare_platform_versions;
pub use contract::create_platform_info;
pub use contract::get_platform_endianness_string;
pub use contract::get_platform_engine;
pub use contract::get_platform_engine_string;
pub use contract::get_platform_info;
pub use contract::get_platform_kind;
pub use contract::get_platform_kind_string;
pub use contract::get_platform_name;
pub use contract::get_platform_name_string;
pub use contract::get_platform_runtime;
pub use contract::get_platform_runtime_string;
pub use contract::is_platform_desktop;
pub use contract::is_platform_mobile;
pub use contract::is_platform_native;
pub use contract::is_platform_touch;
pub use contract::is_platform_version_at_least;
pub use contract::is_platform_web;
pub use contract::parse_platform_endianness;
pub use contract::parse_platform_engine;
pub use contract::parse_platform_kind;
pub use contract::parse_platform_name;
pub use contract::parse_platform_runtime;
