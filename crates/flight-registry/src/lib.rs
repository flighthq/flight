mod registry_table;

pub mod contract;

// Public lane: every name exported by the pinned TS `index.ts`, plus the Rust types required by
// those signatures. `KindMap` represents the TS built-in Map and is not a registry-owned TS type.
pub use contract::KindMap;
pub use contract::OrdinalTable;
pub use contract::concat_kind_map;
pub use contract::create_ordinal_table;
pub use contract::get_kind_map_keys;
pub use contract::get_ordinal_table_entry;
pub use contract::with_kind_map_entry;
pub use contract::without_kind_map_entry;
