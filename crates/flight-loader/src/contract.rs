//! Full loader contract, including initialization and exact string-table helpers.
//! These implementation seams stay out of the curated package root.
//!
//! ```compile_fail
//! use flight_loader::initialize_resource_loader;
//! ```
//!
//! ```compile_fail
//! use flight_loader::get_resource_load_item_status_string;
//! ```
//!
//! ```compile_fail
//! use flight_loader::get_resource_load_report_status_string;
//! ```
//!
//! ```compile_fail
//! use flight_loader::get_resource_loader_error_policy_string;
//! ```
//!
//! ```compile_fail
//! use flight_loader::get_resource_loader_retry_backoff_string;
//! ```
//!
//! ```compile_fail
//! use flight_loader::parse_resource_load_item_status;
//! ```
//!
//! ```compile_fail
//! use flight_loader::parse_resource_load_report_status;
//! ```
//!
//! ```compile_fail
//! use flight_loader::parse_resource_loader_error_policy;
//! ```
//!
//! ```compile_fail
//! use flight_loader::parse_resource_loader_retry_backoff;
//! ```
//!

pub use crate::enums::*;
pub use crate::load::*;
pub use crate::resource_loader::*;
pub use crate::sugar::ResourceLoaderMethods;
pub use crate::types::*;
