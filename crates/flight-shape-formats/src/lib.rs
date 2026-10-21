//! Native retained-shape JSON and the shared built-in command schema table (TS
//! `@flighthq/shape-formats`).

mod shape_command_schemas;
mod shape_json;
mod types;

pub mod contract;

// The pinned TS index curates these three public values.
pub use contract::DEFAULT_SHAPE_COMMAND_SCHEMAS;
pub use contract::format_shape_json;
pub use contract::parse_shape_json;
