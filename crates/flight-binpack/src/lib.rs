mod explain_unpacked_rectangles;
mod pack_rectangles;

pub mod contract;

// Public lane: the exports of the pinned TS `index.ts` (explainUnpackedRectangles,
// getPackResultOccupancy, packRectangles) plus the public type exports. The free constructor
// functions are contract-only (D13: they are not root sugar), as are
// BIN_PACK_DEFAULT_MAX_EXTENT and the D9e string conversions.
pub use contract::explain_unpacked_rectangles;
pub use contract::get_pack_result_occupancy;
pub use contract::pack_rectangles;

pub use contract::BinPackHeuristic;
pub use contract::BinPackOptions;
pub use contract::PackResult;
pub use contract::PackableRectangle;
pub use contract::PackedRectangle;
pub use contract::RectangleId;
pub use contract::UnpackedRectangleExplanation;
pub use contract::UnpackedRectangleReason;
