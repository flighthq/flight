mod device_form_factor;
mod js_pattern;
mod user_agent;
mod user_agent_native;
mod user_agent_parse;

pub mod contract;

// Public lane: TS `index.ts` re-exports both modules wholesale, so the root matches `contract`, plus
// the owned DeviceFormFactor type and constants (types/src/DeviceFormFactor.ts).
pub use contract::DEVICE_FORM_FACTOR_CAR;
pub use contract::DEVICE_FORM_FACTOR_DESKTOP;
pub use contract::DEVICE_FORM_FACTOR_PHONE;
pub use contract::DEVICE_FORM_FACTOR_TABLET;
pub use contract::DEVICE_FORM_FACTOR_TV;
pub use contract::DEVICE_FORM_FACTOR_UNKNOWN;
pub use contract::DEVICE_FORM_FACTOR_WATCH;
pub use contract::DeviceFormFactor;
pub use contract::detect_endianness;
pub use contract::parse_user_agent_arch;
pub use contract::parse_user_agent_engine;
pub use contract::parse_user_agent_engine_version;
pub use contract::parse_user_agent_form_factor;
pub use contract::parse_user_agent_kind;
pub use contract::parse_user_agent_name;
pub use contract::parse_user_agent_os_name;
pub use contract::parse_user_agent_os_version;
pub use contract::parse_user_agent_pointer_width;
pub use contract::parse_user_agent_runtime;
pub use contract::parse_user_agent_version;
