mod protocol;
mod types;

pub mod contract;

// Public lane: the seventeen functions named by pinned TS `index.ts`, plus the locally owned types
// their signatures require. `initialize_protocol_handler` stays in `contract`.
pub use contract::attach_protocol_handler;
pub use contract::create_protocol_handler;
pub use contract::create_protocol_url;
pub use contract::detach_protocol_handler;
pub use contract::dispose_protocol_handler;
pub use contract::get_protocol_launch_url;
pub use contract::get_registered_protocol_schemes;
pub use contract::is_protocol_scheme_default;
pub use contract::is_protocol_scheme_registered;
pub use contract::is_valid_protocol_scheme;
pub use contract::parse_protocol_url;
pub use contract::register_protocol_scheme;
pub use contract::register_protocol_schemes;
pub use contract::remove_protocol_scheme_as_default;
pub use contract::set_protocol_scheme_as_default;
pub use contract::unregister_protocol_scheme;
pub use contract::unregister_protocol_schemes;

pub use contract::HostProtocolCapabilities;
pub use contract::HostProtocolDefaultCapability;
pub use contract::HostProtocolLaunchCapability;
pub use contract::HostProtocolOpenCapability;
pub use contract::HostProtocolRegistrationCapability;
pub use contract::HostProtocolRegistrationQueryCapability;
pub use contract::HostProtocolUnregistrationCapability;
pub use contract::ParsedProtocolUrl;
pub use contract::ProtocolHandler;
pub use contract::ProtocolOpenListener;
pub use contract::ProtocolUnsubscribe;
pub use contract::ProtocolUrlParts;
