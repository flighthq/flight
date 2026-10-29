mod requirement_collector;
mod requirement_set;
mod requirement_set_raw;
mod sugar;
mod types;

pub mod contract;

// Public lane: the five functions exported by pinned TS `index.ts`, plus the locally owned types
// their signatures use. `initialize_requirement_set` and enum string helpers stay contract-only.
pub use contract::Requirement;
pub use contract::RequirementFacet;
pub use contract::RequirementSet;
pub use contract::collect_scene2d_requirements;
pub use contract::create_requirement_set;
pub use contract::diff_requirement_sets;
pub use contract::merge_requirement_sets;
pub use contract::report_requirement;
