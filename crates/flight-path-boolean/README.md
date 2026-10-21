# flight-path-boolean

Boolean path operations over flight-path: union, intersect, difference, XOR, offset, simplify and region resolution, through a pluggable `PathBooleanKernel` (the stock Martinez kernel).

## Precision

Contours are `f64` because flight-path coordinates are `f64` (`Path.data`, TS `number`), and the Martinez sweep and the offset builder use relative tolerances tuned in double, as in TS. Every `f64` item carries an `allow(f64)` reason; `cargo run -p cargo-flight-lint -- allows --crate flight-path-boolean --rule f64` lists all of them, private helpers included. None was converted, and f32 sufficiency has not been measured. Public items:

- `PathBooleanContour` (martinez_kernel.rs): Martinez sweep: intersection/orientation predicates and relative vertex snapping over f64 contour coordinates, with tolerances (1e-9 snap, 1e-12 intersection) tuned in double as in TS; f32 sufficiency not measured.
- `PathBooleanOptions` (boolean_paths.rs): operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured.
- `PathOffsetOptions` (offset_path.rs): offset construction (joins, caps, arcs, signed-area collapse tests) over f64 contour coordinates with relative 1e-9/1e-12 tolerances tuned in double as in TS; f32 sufficiency not measured.
- `explain_offset_path` (explain_path_boolean.rs): operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured.
- `offset_path` (offset_path.rs): offset construction (joins, caps, arcs, signed-area collapse tests) over f64 contour coordinates with relative 1e-9/1e-12 tolerances tuned in double as in TS; f32 sufficiency not measured.
- `resolve_path_regions` (resolve_path_regions.rs): operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured.
- `union_all_paths` (union_all_paths.rs): operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured.
- `write_path_boolean_contours` (write_path_boolean_contours.rs): operates on f64 path/contour coordinates (flight-path Path.data and flatten_path contours, TS number); f32 sufficiency not measured.
