//! Full source contract; portable sharing exposes no ambient backend installation or availability API.
//!
//! ```compile_fail
//! use flight_share::contract::create_web_share_backend;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::explain_share_backend;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::get_share_backend;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::install_share_host_backend;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::is_share_available;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::observe_share_host_result;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::reset_share_backend_for_test;
//! ```
//!
//! ```compile_fail
//! use flight_share::contract::set_share_backend;
//! ```
//!

pub use crate::host_explain::*;
pub use crate::share::*;
pub use crate::types::*;
