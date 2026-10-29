//! flight-compiler: string-union PathOffsetEnd PathOffsetJoin PathBooleanExplanationOperation PathBooleanExplanationReason=kebab-case
//! flight-compiler: readonly-fields PathBooleanExplanation
//! The option and explanation records of the boolean, offset and simplify operations. They name no
//! Path runtime function, so their TypeScript module belongs to the package's contract project with
//! the kernel seam (`martinez_kernel`).

use flight_path::PathWinding;

// flight-lint: allow(f64) operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured
/// Options controlling the boolean path operations (TS `PathBooleanOptions`). `fill_rule` is a
/// `PathWinding`, exactly TS (`fillRule?: PathWinding`): only even-odd and non-zero are public
/// options. The positive/negative rules of `PathBooleanFillRule` stay kernel/offset conventions.
#[derive(Debug, Clone)]
pub struct PathBooleanOptions {
    pub fill_rule: Option<PathWinding>,
    pub tolerance: Option<f64>,
}

/// The kind of boolean operation that was attempted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanExplanationOperation {
    Offset,
    Simplify,
}

/// The reason the operation produced a degenerate or empty result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathBooleanExplanationReason {
    CollapsedOrDegenerate,
    EmptyInput,
    NonFiniteDelta,
}

/// Explains why a boolean path operation (offset or simplify) produced a
/// degenerate or empty result. `None` means the operation succeeded normally.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PathBooleanExplanation {
    pub operation: PathBooleanExplanationOperation,
    pub reason: PathBooleanExplanationReason,
}

/// Join style for the convex side of offset path corners.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathOffsetJoin {
    Bevel,
    Miter,
    Round,
    Square,
}

/// End cap style for open path terminals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathOffsetEnd {
    Butt,
    Round,
    Square,
}

// flight-lint: allow(f64) offset construction (joins, caps, arcs, signed-area collapse tests) over f64 contour coordinates with relative 1e-9/1e-12 tolerances tuned in double as in TS; f32 sufficiency not measured
/// Options controlling the offset path operation.
#[derive(Debug, Clone)]
pub struct PathOffsetOptions {
    pub join: Option<PathOffsetJoin>,
    pub end: Option<PathOffsetEnd>,
    pub miter_limit: Option<f64>,
    pub tolerance: Option<f64>,
    pub arc_tolerance: Option<f64>,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the inline TS PathBooleanExplanation.operation string union; TS exports no get_/parse_ free functions
pub fn get_path_boolean_explanation_operation_string(
    value: PathBooleanExplanationOperation,
) -> &'static str {
    return match value {
        PathBooleanExplanationOperation::Offset => "offset",
        PathBooleanExplanationOperation::Simplify => "simplify",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the inline TS PathBooleanExplanation.reason string union; TS exports no get_/parse_ free functions
pub fn get_path_boolean_explanation_reason_string(
    value: PathBooleanExplanationReason,
) -> &'static str {
    return match value {
        PathBooleanExplanationReason::CollapsedOrDegenerate => "collapsed-or-degenerate",
        PathBooleanExplanationReason::EmptyInput => "empty-input",
        PathBooleanExplanationReason::NonFiniteDelta => "non-finite-delta",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathOffsetEnd string union; TS exports no get_/parse_ free functions
pub fn get_path_offset_end_string(value: PathOffsetEnd) -> &'static str {
    return match value {
        PathOffsetEnd::Butt => "butt",
        PathOffsetEnd::Round => "round",
        PathOffsetEnd::Square => "square",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathOffsetJoin string union; TS exports no get_/parse_ free functions
pub fn get_path_offset_join_string(value: PathOffsetJoin) -> &'static str {
    return match value {
        PathOffsetJoin::Bevel => "bevel",
        PathOffsetJoin::Miter => "miter",
        PathOffsetJoin::Round => "round",
        PathOffsetJoin::Square => "square",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the inline TS PathBooleanExplanation.operation string union; TS exports no get_/parse_ free functions
pub fn parse_path_boolean_explanation_operation(
    value: &str,
) -> Option<PathBooleanExplanationOperation> {
    return match value {
        "offset" => Some(PathBooleanExplanationOperation::Offset),
        "simplify" => Some(PathBooleanExplanationOperation::Simplify),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the inline TS PathBooleanExplanation.reason string union; TS exports no get_/parse_ free functions
pub fn parse_path_boolean_explanation_reason(value: &str) -> Option<PathBooleanExplanationReason> {
    return match value {
        "collapsed-or-degenerate" => Some(PathBooleanExplanationReason::CollapsedOrDegenerate),
        "empty-input" => Some(PathBooleanExplanationReason::EmptyInput),
        "non-finite-delta" => Some(PathBooleanExplanationReason::NonFiniteDelta),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathOffsetEnd string union; TS exports no get_/parse_ free functions
pub fn parse_path_offset_end(value: &str) -> Option<PathOffsetEnd> {
    return match value {
        "butt" => Some(PathOffsetEnd::Butt),
        "round" => Some(PathOffsetEnd::Round),
        "square" => Some(PathOffsetEnd::Square),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS PathOffsetJoin string union; TS exports no get_/parse_ free functions
pub fn parse_path_offset_join(value: &str) -> Option<PathOffsetJoin> {
    return match value {
        "bevel" => Some(PathOffsetJoin::Bevel),
        "miter" => Some(PathOffsetJoin::Miter),
        "round" => Some(PathOffsetJoin::Round),
        "square" => Some(PathOffsetJoin::Square),
        _ => None,
    };
}

impl Default for PathBooleanOptions {
    fn default() -> Self {
        return PathBooleanOptions {
            fill_rule: None,
            tolerance: None,
        };
    }
}

impl Default for PathOffsetOptions {
    fn default() -> Self {
        return PathOffsetOptions {
            join: None,
            end: None,
            miter_limit: None,
            tolerance: None,
            arc_tolerance: None,
        };
    }
}
