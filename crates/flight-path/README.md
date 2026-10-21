# flight-path

Vector paths: construction, measurement, flattening, curve fitting, dashing, morphing, stroking and tessellation.

## Precision

Path coordinates are `f64` (`Path.data`, TS `number`); D1 names path signed area and tessellation as likely `f64` candidates. Every `f64` item carries an `allow(f64)` reason (`cargo run -p cargo-flight-lint -- allows --crate flight-path --rule f64` lists all of them, including private helpers). None was converted, and f32 sufficiency has not been measured for any of them. Public items:

- `Path` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `PathMesh` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `PathMorph` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `PathSegment` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `StrokePathPieceGeometry` (stroke_path_geometry.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `StrokeStyle` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `acquire_path_mesh` (path_mesh_pool.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `append_path_arc` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_circle` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_cubic_curve_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_ellipse` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_elliptical_arc_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_line_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_move_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_polygon` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_polyline` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_quadratic_curve_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_rectangle` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_rounded_rectangle` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_rounded_rectangle_with_corner_radii` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `append_path_tangent_arc_to` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `build_path_morph` (path_morph_geometry.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `build_stroke_path_geometry` (stroke_path_geometry.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `clean_path` (clean_path.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `contains_path_point` (contains_path_point.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `dash_path` (dash_path.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `decimate_path` (decimate_path.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `explain_stroke_path_tessellation` (explain_stroke_path_tessellation.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `fit_path_curves` (fit_path_curves.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `flatten_path` (flatten_path.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_cubic_bezier_curvature` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_cubic_bezier_point` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_cubic_bezier_tangent` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_bounds` (get_path_bounds.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_contour_lengths` (get_path_contour_lengths.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_contour_orientation` (get_path_signed_area.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `get_path_curvature_at_distance` (get_path_curvature_at_distance.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_last_point` (path.rs): path coordinates are f64 (Path.data, TS number); D1 names path as an f64 candidate; f32 sufficiency not measured.
- `get_path_length` (get_path_length.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_nearest_point` (get_path_nearest_point.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_point_at_distance` (get_path_point_at_distance.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_position_at_distance` (get_path_point_at_distance.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_segment_curvature_at_parameter` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_segment_point_at_parameter` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_segment_tangent_at_parameter` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_path_signed_area` (get_path_signed_area.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `get_path_tangent_at_distance` (get_path_point_at_distance.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_quadratic_bezier_curvature` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_quadratic_bezier_point` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `get_quadratic_bezier_tangent` (get_path_segment_at_parameter.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `initialize_path_morph` (path_morph_geometry.rs): Bezier evaluation, arc length and flattening over f64 path coordinates with tolerances tuned in double; f32 sufficiency not measured.
- `sample_path_morph` (path_morph.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `stroke_path` (stroke_path.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `tessellate_path` (tessellate_path.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `tessellate_path_into` (tessellate_path.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `tessellate_stroke_path` (tessellate_stroke_path.rs): orientation/area/winding/intersection predicates over f64 path coordinates (D1 path candidate: signed area, tessellation); f32 sufficiency not measured.
- `transform_path` (transform_path.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
- `translate_path` (transform_path.rs): operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured.
