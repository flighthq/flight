mod explain_unpacked_rectangles;
mod pack_rectangles;

pub mod contract;

// Public lane: the exports of the pinned TS `index.ts` (explainUnpackedRectangles,
// getPackResultOccupancy, packRectangles), plus the Rust types and constructors the public
// signatures require. Contract-only seams (BIN_PACK_DEFAULT_MAX_EXTENT and the D9e string
// conversions) stay in `contract`.
pub use contract::create_bin_pack_options;
pub use contract::create_pack_result;
pub use contract::create_packable_rectangle;
pub use contract::create_packed_rectangle;
pub use contract::create_unpacked_rectangle_explanation;
pub use contract::explain_unpacked_rectangles;
pub use contract::get_pack_result_occupancy;
pub use contract::initialize_pack_result;
pub use contract::initialize_packable_rectangle;
pub use contract::initialize_packed_rectangle;
pub use contract::initialize_unpacked_rectangle_explanation;
pub use contract::pack_rectangles;

pub use contract::BinPackHeuristic;
pub use contract::BinPackOptions;
pub use contract::PackResult;
pub use contract::PackableRectangle;
pub use contract::PackedRectangle;
pub use contract::RectangleId;
pub use contract::UnpackedRectangleExplanation;
pub use contract::UnpackedRectangleReason;
