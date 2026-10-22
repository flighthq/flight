mod boolean_paths;
mod explain_path_boolean;
mod martinez_kernel;
mod offset_path;
mod resolve_path_regions;
mod simplify_path;
mod union_all_paths;
mod write_path_boolean_contours;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts` (every module wholesale, plus
// `createMartinezPathBooleanKernel` and `martinezPathBooleanKernel` from martinezKernel.ts), plus the
// Rust types the public signatures require. `initialize_martinez_path_boolean_kernel` stays in `contract`.
pub use contract::ComputePathBooleanFunction;
pub use contract::MARTINEZ_PATH_BOOLEAN_KERNEL;
pub use contract::PathBooleanContour;
pub use contract::PathBooleanExplanation;
pub use contract::PathBooleanExplanationOperation;
pub use contract::PathBooleanExplanationReason;
pub use contract::PathBooleanFillRule;
pub use contract::PathBooleanKernel;
pub use contract::PathBooleanOperation;
pub use contract::PathBooleanOptions;
pub use contract::PathOffsetEnd;
pub use contract::PathOffsetJoin;
pub use contract::PathOffsetOptions;
pub use contract::boolean_paths;
pub use contract::create_martinez_path_boolean_kernel;
pub use contract::difference_paths;
pub use contract::explain_offset_path;
pub use contract::explain_simplify_path;
pub use contract::get_path_boolean_explanation_operation_string;
pub use contract::get_path_boolean_explanation_reason_string;
pub use contract::get_path_boolean_fill_rule_string;
pub use contract::get_path_boolean_operation_string;
pub use contract::get_path_offset_end_string;
pub use contract::get_path_offset_join_string;
pub use contract::intersect_paths;
pub use contract::offset_path;
pub use contract::parse_path_boolean_explanation_operation;
pub use contract::parse_path_boolean_explanation_reason;
pub use contract::parse_path_boolean_fill_rule;
pub use contract::parse_path_boolean_operation;
pub use contract::parse_path_offset_end;
pub use contract::parse_path_offset_join;
pub use contract::resolve_path_regions;
pub use contract::simplify_path;
pub use contract::union_all_paths;
pub use contract::union_paths;
pub use contract::write_path_boolean_contours;
pub use contract::xor_paths;
