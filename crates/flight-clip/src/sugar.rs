//! flight-compiler: rust-only

use flight_entity::Ref;
use flight_geometry::{Matrix, Rectangle};
use flight_path::{Path, PathWinding};

use crate::clip_region::*;
use crate::clip_region_shapes::*;
use crate::types::{ClipRegion, ClipRegionExplanation};

/// Rust-side sugar for the shared clip handle. Every method delegates to the free-function contract.
pub trait ClipRegionMethods {
    fn bounds(&self, out: &mut Rectangle);
    fn clone_region(&self) -> Ref<ClipRegion>;
    fn contains_clip_region(&self, other: &Ref<ClipRegion>) -> bool;
    // flight-lint: allow(f64) point queries compare against f64 Path.data contour coordinates
    fn contains_point(&self, x: f64, y: f64) -> bool;
    fn contains_rectangle(&self, rectangle: &Rectangle) -> bool;
    fn copy_from(&self, source: &Ref<ClipRegion>);
    fn equals_region(&self, other: &Ref<ClipRegion>) -> bool;
    fn explain(&self) -> ClipRegionExplanation;
    fn intersect_from(&self, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>);
    fn intersects_clip_region(&self, other: &Ref<ClipRegion>) -> bool;
    fn intersects_rectangle(&self, rectangle: &Rectangle) -> bool;
    fn invalidate(&self);
    fn is_empty(&self) -> bool;
    fn is_rectangular(&self) -> bool;
    fn normalize_from(&self, source: &Ref<ClipRegion>);
    fn release(&self);
    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    fn set_contours(&self, contours: &[Vec<f64>], winding: PathWinding);
    fn set_rectangle(&self, rectangle: &Rectangle);
    fn transform_from(&self, source: &Ref<ClipRegion>, matrix: &Matrix);
    fn union_from(&self, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>);
}

#[cfg(test)]
mod tests {
    use flight_geometry::{create_matrix, create_rectangle};
    use flight_path::PathWinding;

    use super::*;

    fn triangle() -> Vec<Vec<f64>> {
        return vec![vec![0.0, 0.0, 10.0, 0.0, 5.0, 10.0]];
    }

    #[test]
    fn query_sugar_matches_free_functions() {
        let clip = ClipRegion::new_from_contours(&triangle(), PathWinding::EvenOdd);
        let mut method = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut function = create_rectangle(0.0, 0.0, 0.0, 0.0);
        clip.bounds(&mut method);
        get_clip_region_bounds(&mut function, &clip);
        assert_eq!(method, function);
        assert_eq!(
            clip.contains_point(5.0, 5.0),
            clip_region_contains_point(&clip, 5.0, 5.0)
        );
        assert!(clip.equals_region(&clip.clone_region()));
    }

    #[test]
    fn mutation_sugar_matches_free_functions() {
        let source = ClipRegion::new_from_rectangle(&create_rectangle(1.0, 2.0, 3.0, 4.0));
        let method = ClipRegion::new_from_rectangle(&create_rectangle(0.0, 0.0, 0.0, 0.0));
        let function = ClipRegion::new_from_rectangle(&create_rectangle(0.0, 0.0, 0.0, 0.0));
        let matrix = create_matrix(2.0, 0.0, 0.0, 3.0, 4.0, 5.0);
        method.transform_from(&source, &matrix);
        transform_clip_region(&function, &source, &matrix);
        assert!(equals_clip_region(&method, &function));
    }
}

impl ClipRegionMethods for Ref<ClipRegion> {
    fn bounds(&self, out: &mut Rectangle) {
        get_clip_region_bounds(out, self);
    }

    fn clone_region(&self) -> Ref<ClipRegion> {
        return clone_clip_region(self);
    }

    fn contains_clip_region(&self, other: &Ref<ClipRegion>) -> bool {
        return clip_region_contains_clip_region(self, other);
    }

    // flight-lint: allow(f64) point queries compare against f64 Path.data contour coordinates
    fn contains_point(&self, x: f64, y: f64) -> bool {
        return clip_region_contains_point(self, x, y);
    }

    fn contains_rectangle(&self, rectangle: &Rectangle) -> bool {
        return clip_region_contains_rectangle(self, rectangle);
    }

    fn copy_from(&self, source: &Ref<ClipRegion>) {
        copy_clip_region(self, source);
    }

    fn equals_region(&self, other: &Ref<ClipRegion>) -> bool {
        return equals_clip_region(self, other);
    }

    fn explain(&self) -> ClipRegionExplanation {
        return explain_clip_region(self);
    }

    fn intersect_from(&self, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
        intersect_clip_regions(self, a, b);
    }

    fn intersects_clip_region(&self, other: &Ref<ClipRegion>) -> bool {
        return clip_region_intersects_clip_region(self, other);
    }

    fn intersects_rectangle(&self, rectangle: &Rectangle) -> bool {
        return clip_region_intersects_rectangle(self, rectangle);
    }

    fn invalidate(&self) {
        invalidate_clip_region(self);
    }

    fn is_empty(&self) -> bool {
        return is_clip_region_empty(self);
    }

    fn is_rectangular(&self) -> bool {
        return is_clip_region_rectangular(self);
    }

    fn normalize_from(&self, source: &Ref<ClipRegion>) {
        normalize_clip_region(self, source);
    }

    fn release(&self) {
        release_clip_region(self);
    }

    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    fn set_contours(&self, contours: &[Vec<f64>], winding: PathWinding) {
        set_clip_region_to_contours(self, contours, winding);
    }

    fn set_rectangle(&self, rectangle: &Rectangle) {
        set_clip_region_to_rectangle(self, rectangle);
    }

    fn transform_from(&self, source: &Ref<ClipRegion>, matrix: &Matrix) {
        transform_clip_region(self, source, matrix);
    }

    fn union_from(&self, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
        union_clip_regions(self, a, b);
    }
}

impl ClipRegion {
    // flight-lint: allow(f64) circle geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_circle(x: f64, y: f64, radius: f64, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_circle(x, y, radius, tolerance);
    }

    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    pub fn new_from_contours(contours: &[Vec<f64>], winding: PathWinding) -> Ref<ClipRegion> {
        return create_clip_region_from_contours(contours, winding);
    }

    // flight-lint: allow(f64) ellipse geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_ellipse(rectangle: &Rectangle, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_ellipse(rectangle, tolerance);
    }

    // flight-lint: allow(f64) flatten tolerance belongs to the f64 Path.data geometry lane
    pub fn new_from_path(path: &Path, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_path(path, tolerance);
    }

    pub fn new_from_rectangle(rectangle: &Rectangle) -> Ref<ClipRegion> {
        return create_clip_region_from_rectangle(rectangle);
    }

    // flight-lint: allow(f64) rounded rectangle geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_rounded_rectangle(
        rectangle: &Rectangle,
        radius: f64,
        tolerance: Option<f64>,
    ) -> Ref<ClipRegion> {
        return create_clip_region_from_rounded_rectangle(rectangle, radius, tolerance);
    }
}
