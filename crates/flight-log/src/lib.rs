mod console_log_sink;
mod log;
mod warn_missing_host_capability;

pub mod contract;

// Public lane: the pinned TS `index.ts` exports (every function), plus the types.
pub use contract::*;
