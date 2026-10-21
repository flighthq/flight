mod svg_path_data;
mod types;

pub mod contract;

// Public lane: the four functions the pinned TS `index.ts` names, plus the types their signatures
// require.
pub use contract::SvgPathDataExplanation;
pub use contract::SvgPathDataFormatOptions;
pub use contract::append_svg_path_data;
pub use contract::explain_svg_path_data;
pub use contract::format_svg_path_data;
pub use contract::parse_svg_path_data;
