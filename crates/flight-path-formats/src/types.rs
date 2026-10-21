/// Formatting options for `format_svg_path_data` (TS `SvgPathDataFormatOptions`). Plain record.
// flight-lint: allow(f64) the precision is the exponent of `10 ** precision` in f64 path-coordinate arithmetic (TS number); f64 keeps fractional/negative precision behaving as the source
#[derive(Clone, Debug, PartialEq)]
pub struct SvgPathDataFormatOptions {
    /// Decimal places to retain; `None` (omitted) preserves full numeric precision.
    pub precision: Option<f64>,
}

/// Why SVG path data cannot be parsed (the non-null TS `explainSvgPathData` result). `position` is
/// the UTF-16 code-unit index into the input, as in the source; `reason` is the stable source
/// spelling (e.g. `"expected-moveto"`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SvgPathDataExplanation {
    pub position: usize,
    pub reason: String,
}
