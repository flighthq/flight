mod connectivity;
mod types;

pub mod contract;

// Public lane: the eleven functions the pinned TS `index.ts` names, plus the types their signatures
// require and the D9e string table. `initialize_connectivity` stays in `contract`.
pub use contract::Connectivity;
pub use contract::ConnectivityChangeListener;
pub use contract::ConnectivityConnectionType;
pub use contract::ConnectivityReachability;
pub use contract::ConnectivityReachabilityFuture;
pub use contract::ConnectivityReachabilityOptions;
pub use contract::ConnectivityReachabilityResult;
pub use contract::ConnectivityStatus;
pub use contract::ConnectivityUnsubscribe;
pub use contract::HostConnectivityCapabilities;
pub use contract::HostConnectivityChangeCapability;
pub use contract::HostConnectivityReachabilityCapability;
pub use contract::HostConnectivityStatusCapability;
pub use contract::attach_connectivity;
pub use contract::create_connectivity;
pub use contract::destroy_connectivity;
pub use contract::detach_connectivity;
pub use contract::detect_connectivity_reachability;
pub use contract::dispose_connectivity;
pub use contract::get_connectivity_connection_type_string;
pub use contract::get_connectivity_online;
pub use contract::get_connectivity_status;
pub use contract::has_connectivity_status_changed;
pub use contract::is_connectivity_metered;
pub use contract::is_connectivity_save_data_enabled;
pub use contract::parse_connectivity_connection_type;
