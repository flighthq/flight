//! Full contract, including the guard installation seam. No ambient transport backend API.
//!
//! ```compile_fail
//! use flight_net::contract::create_web_net_backend;
//! ```
//!
//! ```compile_fail
//! use flight_net::contract::get_net_backend;
//! ```
//!
//! ```compile_fail
//! use flight_net::contract::install_net_host_backend;
//! ```
//!
//! ```compile_fail
//! use flight_net::contract::reset_net_backend_for_test;
//! ```
//!
//! ```compile_fail
//! use flight_net::contract::set_net_backend;
//! ```
//!

pub use crate::enable_net_guards::*;
pub use crate::enums::*;
pub use crate::host_explain::*;
pub use crate::net::*;
pub use crate::net_form::*;
pub use crate::types::*;
