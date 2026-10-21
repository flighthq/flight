mod built_in_requirement_catalog_entries;
mod requirement_catalog;
mod types;

pub mod contract;

// The pinned `index.ts` and `contract.ts` export the same two source modules.
pub use contract::*;
