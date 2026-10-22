mod host_explain;
mod lifecycle;
mod types;

pub mod contract;

// Public lane: the twelve functions the pinned TS `index.ts` names, plus the types their signatures
// require and the D9e string tables. `initialize_app_lifecycle` stays in `contract`.
pub use contract::AppLaunchKind;
pub use contract::AppLifecycle;
pub use contract::AppLifecycleState;
pub use contract::AppLifecycleStateBag;
pub use contract::AppMemoryPressure;
pub use contract::HostLifecycleCapabilities;
pub use contract::HostLifecycleCapability;
pub use contract::LifecycleListener;
pub use contract::LifecycleMemoryWarningListener;
pub use contract::LifecycleOperation;
pub use contract::LifecycleUnsubscribe;
pub use contract::attach_app_lifecycle;
pub use contract::create_app_lifecycle;
pub use contract::detach_app_lifecycle;
pub use contract::dispose_app_lifecycle;
pub use contract::explain_lifecycle_operation;
pub use contract::get_app_launch_kind;
pub use contract::get_app_launch_kind_string;
pub use contract::get_app_lifecycle_state;
pub use contract::get_app_lifecycle_state_string;
pub use contract::get_app_memory_pressure_string;
pub use contract::get_lifecycle_operation_string;
pub use contract::has_lifecycle_operation;
pub use contract::is_app_active;
pub use contract::is_app_background;
pub use contract::is_app_inactive;
pub use contract::parse_app_launch_kind;
pub use contract::parse_app_lifecycle_state;
pub use contract::parse_app_memory_pressure;
pub use contract::parse_lifecycle_operation;
pub use contract::request_app_back;
