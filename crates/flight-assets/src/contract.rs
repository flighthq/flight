//! Full asset contract, including initialization, acquire hooks and exact status tables.
//! ```compile_fail
//! use flight_assets::initialize_asset_library;
//! ```
//! ```compile_fail
//! use flight_assets::set_asset_acquire_guard;
//! ```
//! ```compile_fail
//! use flight_assets::get_asset_load_status_string;
//! ```
//! ```compile_fail
//! use flight_assets::parse_asset_load_status;
//! ```

pub use crate::asset_library::*;
pub use crate::enable_asset_guards::*;
pub use crate::enums::*;
pub use crate::explain_asset_load::*;
pub use crate::types::*;

pub use crate::sugar::AssetLibraryMethods;
